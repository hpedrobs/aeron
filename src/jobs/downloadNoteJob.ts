import Note from '@models/Note'

import { NoteService } from '@services/NoteService'

import env from '@utils/env'
import { logger } from '@utils/logger'

export class DownloadNoteJob {
    companiesToDownload = env.COMPANIES_TO_DOWNLOAD ? env.COMPANIES_TO_DOWNLOAD.split(',').map((id: string) => Number(id.trim())) : null

    public async run(): Promise<void> {
        try {
            const isCanceledEnabled = env.CANCELADA === 'true'
            const isAuthorizedEnabled = env.AUTORIZADA === 'true'

            const shouldProcessAuthorized = !isCanceledEnabled || isAuthorizedEnabled
            const shouldProcessCanceled = !isAuthorizedEnabled || isCanceledEnabled

            logger.info(`Regras de execução - Processar Autorizadas: ${shouldProcessAuthorized}, Processar Canceladas: ${shouldProcessCanceled}`)

            while (true) {
                const query: any = {
                    linkDownload: { $exists: true, $ne: "" },
                    statusNote: 'DonwloadPending'
                }

                if (shouldProcessAuthorized && !shouldProcessCanceled) {
                    query.sitNote = 'Autorizadas'
                } else if (shouldProcessCanceled && !shouldProcessAuthorized) {
                    query.sitNote = 'Canceladas'
                }

                const notes = await Note.find(query).populate('company')
    
                for (const note of notes) {
                    if (this.companiesToDownload && !this.companiesToDownload.includes(note.company.codeCompanieAccountSystem)) {
                        logger.info(`Empresa ${note.company.name} (${note.company.codeCompanieAccountSystem}) não está na lista de empresas para download. Pulando...`)
                        return
                    }
                    
                    logger.info('----------------------------------------')
                    logger.info(`Iniciando download da empresa: ${note.company.name} (${note.company.codeCompanieAccountSystem}),`)
                    logger.info(`Modelo: ${note.modelNote},`)
                    logger.info(`Situação: ${note.sitNote},`)
                    logger.info(`Periodo: ${note.initialPeriod.toLocaleDateString()} - ${note.finalPeriod.toLocaleDateString()}.`)
    
                    await new NoteService(note).downloadFile()
                }

                await new Promise((resolve) => setTimeout(resolve, 1000 * 60))
            }
        } catch (error) {
            logger.error(`Erro ao realizar o download da empresa.`)
            console.error(error)
        }
    }
}
