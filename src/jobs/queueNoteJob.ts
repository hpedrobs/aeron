import Company, { ICompany } from '@models/Company'
import Note, { StatusNote } from '@models/Note'

import { NoteService } from '@services/NoteService'

import { ApiPfxManager } from '@utils/apiPfxManager'
import env from '@utils/env'
import { logger } from '@utils/logger'
import { getPeriodDates } from '@utils/period'

export class QueueNoteJob {
    companiesToDownload = env.COMPANIES_TO_DOWNLOAD ? env.COMPANIES_TO_DOWNLOAD.split(',').map((id) => Number(id.trim())) : null
    periods = getPeriodDates()

    private async eligibleCompanies(): Promise<ICompany[]> {
        const data = await Company.find({
            // $and: [
            //     { stateRegistration: { $ne: "", $exists: true } },
            //     { stateRegistration: { $ne: null, $exists: true } },
            // ],
            status: "A"
        })

        logger.info('----------------------------------------')
        logger.info(`Quantidade de empresas ativas econtradas: ${data.length}`)

        return data
    }

    private async checkNoteIfCanProcess(codeCompanieAccountSystem: number): Promise<boolean> {
        if (this.companiesToDownload && !this.companiesToDownload.includes(codeCompanieAccountSystem)) return false
        return true
    }

    protected async forEachCombination(
        callback: (_args: {
            modelNote: String
            sitNote: String
            initialPeriod: Date
            finalPeriod: Date
        }) => Promise<void | boolean>
    ) {
        const isCanceledEnabled = env.CANCELADA === 'true'
        const isAuthorizedEnabled = env.AUTORIZADA === 'true'

        const shouldProcessAuthorized = !isCanceledEnabled || isAuthorizedEnabled
        const shouldProcessCanceled = !isAuthorizedEnabled || isCanceledEnabled

        const sitNotes: string[] = []
        if (shouldProcessAuthorized) sitNotes.push('Autorizadas')
        if (shouldProcessCanceled) sitNotes.push('Canceladas')

        for (const modelNote of  ['NF-e', 'NFC-e', 'CT-e']) {
            for (const sitNote of sitNotes) {
                for (const { initialPeriod, finalPeriod } of this.periods) {
                    const result = await callback({ modelNote, sitNote, initialPeriod, finalPeriod })
                    if (result === false) continue 
                }
            }
        }
    }

    private async createNoteNonexistent (company: ICompany): Promise<void> {
        await this.forEachCombination(async ({ modelNote, sitNote, initialPeriod, finalPeriod }) => {
            const existingNote = await Note.findOne({
                company: company._id,
                modelNote, sitNote,
                initialPeriod, finalPeriod
            })

            if (!existingNote) {
                await Note.create({
                    company: company._id,
                    modelNote,
                    sitNote,
                    initialPeriod,
                    finalPeriod,
                    screenshot: '',
                    quantityNotes: 0,
                })
            }
        })
    }

    private async putNoteInQueue(
        company: ICompany,
        status: StatusNote[] = ['Pending', 'Error', 'Processing']
    ): Promise<void> {
        const canProcess = await this.checkNoteIfCanProcess(company.codeCompanieAccountSystem)
        if (!canProcess) return

        await this.createNoteNonexistent(company)

        const today = new Date()
        const currentDay = today.getDate()
        const isInitialMonthWindow = [1, 2, 3, 4, 5].includes(currentDay)
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)

        await this.forEachCombination(async ({ modelNote, sitNote, initialPeriod, finalPeriod }) => {
            try {
                let note = await Note.findOne({
                    company: company._id,
                    sitNote, modelNote,
                    initialPeriod, finalPeriod
                }).populate('company')
                
                if (note != null) {
                    const isPreviousMonth = initialPeriod.getMonth() !== today.getMonth() || initialPeriod.getFullYear() !== today.getFullYear()
                    const updatedBeforeToday = note.updatedAt ? new Date(note.updatedAt) < startOfToday : true

                    // Na virada do mês (dias 1 a 5), se a nota do mês anterior já foi processada em dias anteriores (updatedAt < hoje),
                    // reabre o status para 'Pending' para garantir que eventuais novas notas ou alterações sejam capturadas hoje.
                    if (isInitialMonthWindow && isPreviousMonth && updatedBeforeToday && (note.statusNote === 'Downloaded' || note.statusNote === 'Warning')) {
                        logger.info('----------------------------------------')
                        logger.info(`[Virada de Mês] Reabrindo fila diária do mês anterior para a empresa ${company.name} (${company.codeCompanieAccountSystem}) - ${modelNote} (${sitNote}).`)
                        await Note.findByIdAndUpdate(note._id, { statusNote: 'Pending' })
                        note.statusNote = 'Pending'
                    }

                    if (status.includes(note.statusNote)) {
                        logger.info('----------------------------------------')
                        logger.info(`Empresa: ${company.name} (${company.codeCompanieAccountSystem}),`)
                        logger.info(`Modelo: ${modelNote},`)
                        logger.info(`Situação: ${sitNote},`)
                        logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                        
                        const apiPfxManager = new ApiPfxManager()
                        await apiPfxManager.clearCertificates()

                        if (company.federalRegistration) {
                            const isCertificate = await apiPfxManager.installCertificate(company.federalRegistration)
                            if (isCertificate) {
                                const noteService = new NoteService(note)
                                await noteService.setDownloadLink()
                            } else {
                                logger.error(`Falha ao instalar o certificado para a empresa ${company.name} (${company.codeCompanieAccountSystem}). Pulando...`)
                                await Note.findOneAndUpdate({
                                    company: company._id,
                                    sitNote, modelNote,
                                    initialPeriod, finalPeriod
                                }, {
                                    statusNote: 'Error',
                                    warn: `Falha ao instalar o certificado`,
                                })
                            }
                        } else {
                            await Note.findByIdAndUpdate(note._id, { statusNote: 'Error', warn: `Empresa sem CNPJ (${company.federalRegistration}).` })
                        }
                    }
                }
            } catch (error) {
                logger.info(`Erro ao processar a empresa: ${company.name} (${company.codeCompanieAccountSystem}),`)
                logger.info(`Modelo: ${modelNote},`)
                logger.info(`Situação: ${sitNote},`)
                logger.info(`Periodo: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}.`)
                
                const message = error instanceof Error ? error.message : String(error)

                await Note.findOneAndUpdate({
                    company: company._id,
                    sitNote, modelNote,
                    initialPeriod, finalPeriod
                }, {
                    statusNote: 'Error',
                    warn: `Erro ao processar a nota: ${message}`,
                })
            }
        })
    }

    public async run(): Promise<void> {
        logger.info('----------------------------------------')
        logger.info('Colocando as notas na fila de download...')

        try {
            const companies = await this.eligibleCompanies()
            
            for await (const company of companies) {
                await this.putNoteInQueue(company)
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Erro ao tentar colocar as notas na fila de donwload no sefaz: ${message}`)
        }
    }
}
