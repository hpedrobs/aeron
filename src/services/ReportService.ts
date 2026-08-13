import path from "path"
import fs from "fs"

import { FilterQuery } from "mongoose"

import Note from "@models/Note"
import Company from "@models/Company"

import { logger } from "@utils/logger"

interface ReportData {
    [period: string]: {
        [companyCode: number]: {
            [modelNote: string]: {
                hasNotes: boolean
                importedAt?: Date
                warn?: string
                statusNote?: string
            }
        }
    }
}

export class ReportService {
    private parsePeriod(periodStr: string): { month: number; year: number } {
        const [month, year] = periodStr.split('/')
        const monthNum = parseInt(month, 10)
        const yearNum = parseInt(year, 10)

        if (isNaN(monthNum) || isNaN(yearNum) || monthNum < 1 || monthNum > 12) {
            throw new Error(`Formato de período inválido: ${periodStr}. Use MM/AAAA`)
        }

        return { month: monthNum, year: yearNum }
    }

    private buildPeriodFilter(
        initialPeriod?: string,
        finalPeriod?: string
    ): FilterQuery<typeof Note> {
        if (!initialPeriod && !finalPeriod) {
            // Se nenhum período foi fornecido, retorna um filtro vazio (traz todos)
            return {}
        }

        const dateFilters: any[] = []

        if (initialPeriod) {
            const { month: initMonth, year: initYear } = this.parsePeriod(initialPeriod)
            const initDate = new Date(initYear, initMonth - 1, 1)
            dateFilters.push({ $gte: ["$initialPeriod", initDate] })
        }

        if (finalPeriod) {
            const { month: finalMonth, year: finalYear } = this.parsePeriod(finalPeriod)
            // Pega o último dia do mês final
            const endDate = new Date(finalYear, finalMonth, 0, 23, 59, 59)
            dateFilters.push({ $lte: ["$finalPeriod", endDate] })
        }

        if (dateFilters.length === 0) {
            return {}
        }

        return {
            $expr: {
                $and: dateFilters
            }
        }
    }

    private buildCompanyFilter(companies?: string): number[] | undefined {
        if (!companies) {
            return undefined
        }

        return companies
            .split(',')
            .map(code => parseInt(code.trim(), 10))
            .filter(code => !isNaN(code))
    }

    private formatPeriod(date: Date): string {
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const year = date.getFullYear()
        return `${month}/${year}`
    }

    private groupReportData(notes: any[]): ReportData {
        const data: ReportData = {}

        notes.forEach((note: any) => {
            const period = this.formatPeriod(note.initialPeriod)
            const companyCode = note.company.codeCompanieAccountSystem
            const modelNote = note.modelNote

            if (!data[period]) {
                data[period] = {}
            }

            if (!data[period][companyCode]) {
                data[period][companyCode] = {}
            }

            // Marca se tem notas com status de sucesso (Downloaded ou similar)
            const hasNotes = note.quantityOfNotesDownloaded > 0
            
            if (!data[period][companyCode][modelNote]) {
                data[period][companyCode][modelNote] = {
                    hasNotes: hasNotes,
                    importedAt: hasNotes ? note.updatedAt : undefined,
                    warn: note.warn,
                    statusNote: note.statusNote
                }
            } else if (hasNotes && !data[period][companyCode][modelNote].hasNotes) {
                data[period][companyCode][modelNote] = {
                    hasNotes: true,
                    importedAt: note.updatedAt,
                    warn: note.warn,
                    statusNote: note.statusNote
                }
            }
        })

        return data
    }

    private generateReportText(reportData: ReportData): string {
        const modelNotes = ['NF-e', 'NFC-e', 'NFS-e', 'CT-e']
        let reportText = ''

        // Ordena os períodos
        const sortedPeriods = Object.keys(reportData).sort((a, b) => {
            const [monthA, yearA] = a.split('/').map(Number)
            const [monthB, yearB] = b.split('/').map(Number)
            
            if (yearA !== yearB) return yearB - yearA
            return monthB - monthA
        })

        sortedPeriods.forEach((period, periodIndex) => {
            reportText += `${period}:\n`

            const companies = reportData[period]
            const sortedCompanies = Object.keys(companies)
                .map(Number)
                .sort((a, b) => a - b)

            sortedCompanies.forEach((companyCode) => {
                reportText += `  - ${companyCode}:\n`

                modelNotes.forEach((modelNote) => {
                    const noteData = companies[companyCode][modelNote]
                    
                    if (!noteData) {
                        reportText += `    - ${modelNote}: Sem notas\n`
                        return
                    }
                    
                    let warnMessage = ''
                    if (!noteData.hasNotes) {
                        if (noteData.warn) {
                            warnMessage = `(${noteData.warn})`
                        } else if (noteData.statusNote === 'Error') {
                            warnMessage = '(erro)'
                        }
                    }
                    
                    const status = noteData.hasNotes ? 'Com notas' : `Sem notas ${warnMessage}`
                    
                    if (noteData.hasNotes && noteData.importedAt) {
                        const importedDate = new Date(noteData.importedAt).toLocaleDateString('pt-BR')
                        reportText += `    - ${modelNote}: ${status} (${importedDate})\n`
                    } else {
                        reportText += `    - ${modelNote}: ${status}\n`
                    }
                })
            })

            // Adiciona linha em branco entre períodos (exceto no último)
            if (periodIndex < sortedPeriods.length - 1) {
                reportText += '\n'
            }
        })

        return reportText
    }

    public async generateNotesReport(
        companies?: string,
        initialPeriod?: string,
        finalPeriod?: string
    ): Promise<void> {
        try {
            logger.info('----------------------------------------')
            logger.info(`Gerando relatorio das notas fiscais.`)
            logger.info(`Parametros: companies=${companies || 'todos'}, initialPeriod=${initialPeriod || 'todos'}, finalPeriod=${finalPeriod || 'todos'}`)

            // Construir filtros
            const periodFilter = this.buildPeriodFilter(initialPeriod, finalPeriod)
            const companyCodes = this.buildCompanyFilter(companies)

            let query = Note.find(periodFilter).populate('company')

            // Se houver código de companies, filtrar
            if (companyCodes && companyCodes.length > 0) {
                const companyDocs = await Company.find({
                    codeCompanieAccountSystem: { $in: companyCodes }
                })
                const companyIds = companyDocs.map(c => c._id)
                query = query.where('company').in(companyIds)
            }

            const notes = await query.exec()

            logger.info(`Total de notas encontradas: ${notes.length}`)

            if (notes.length === 0) {
                logger.warn('Nenhuma nota encontrada com os critérios especificados.')
            }

            // Agrupar dados
            const reportData = this.groupReportData(notes)

            // Gerar texto do relatório
            const reportText = this.generateReportText(reportData)

            // Criar pasta "data" se não existir
            const dataDir = path.join(process.cwd(), "data")
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir)
            }

            // Gerar nome do arquivo com data e hora local
            const now = new Date()
            const formattedDate = now.toLocaleDateString("pt-BR").replace(/\//g, "-")
            const formattedTime = now.toLocaleTimeString("pt-BR").replace(/:/g, "-")
            const fileName = `relatorio_notas_${formattedDate}_${formattedTime}.txt`

            const filePath = path.join(dataDir, fileName)

            fs.writeFileSync(filePath, reportText, 'utf-8')
            logger.info(`Exportacao concluida: ${filePath}.`)
        } catch (err) {
            logger.error("Erro ao gerar relatório:", err)
            throw err
        } finally {
            logger.info('----------------------------------------')
            logger.info(`Relatorio das notas fiscais finalizado.`)
        }
    }
}

