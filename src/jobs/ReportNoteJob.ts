import { ReportService } from '@services/ReportService'

import { logger } from '@utils/logger'

export class ReportNoteJob {
    public async run(
        companies?: string,
        initialPeriod?: string,
        finalPeriod?: string
    ): Promise<void> {
        try {
            const reportService = new ReportService()
            await reportService.generateNotesReport(companies, initialPeriod, finalPeriod)
        } catch (error) {
            logger.error(`Erro ao realizar o relatorio das notas fiscais.`)
            console.error(error)
        }
    }
}
