import { logger } from "./logger"
import env from "./env"

export type Period = { initialPeriod: Date, finalPeriod: Date }

export function getPeriodDates(): Period[] {
    const today = new Date()
    const currentDay = today.getDate()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    const periods: Period[] = []

    logger.info("Iniciando cálculo dos períodos...")
    logger.info(`Data atual: ${today.toLocaleDateString()}`)

    const hasYearMonthRange = env.YEAR_START && env.MONTH_START && env.YEAR_END && env.MONTH_END
    const hasDaysDownload = !!env.DAYS_DOWNLOAD

    if (hasYearMonthRange) {
        logger.info("Calculando períodos com base no intervalo de ano e mês definido no ambiente...")
        const yearStart = Number(env.YEAR_START)
        const monthStart = Number(env.MONTH_START) - 1
        const yearEnd = Number(env.YEAR_END)
        const monthEnd = Number(env.MONTH_END) - 1

        logger.debug(`Intervalo definido: ${yearStart}-${monthStart + 1} até ${yearEnd}-${monthEnd + 1}`)

        for (let year = yearStart; year <= yearEnd; year++) {
            for (let month = 0; month < 12; month++) {
                if (year === yearStart && month < monthStart) continue
                if (year === yearEnd && month > monthEnd) break

                const initialPeriod = new Date(year, month, 1)
                const finalPeriod = new Date(year, month + 1, 0)
                periods.push({ initialPeriod, finalPeriod })

                logger.debug(`Adicionado período: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}`)
            }
        }
    }

    if (hasDaysDownload) {
        logger.info("Calculando períodos com base nos dias de download definidos no ambiente...")
        const daysDownload = typeof env.DAYS_DOWNLOAD === 'string'
            ? env.DAYS_DOWNLOAD.split(',').map((day) => Number(day.trim())).sort((a, b) => a - b)
            : []

        logger.debug(`Dias de download definidos: ${daysDownload.join(", ")}`)

        const lastMonth = new Date(currentYear, currentMonth, 0)
        const recentDays = [
            lastMonth.getDate(),
            new Date(currentYear, currentMonth, currentDay - 1).getDate(),
            new Date(currentYear, currentMonth, currentDay - 2).getDate(),
            new Date(currentYear, currentMonth, currentDay - 3).getDate(),
        ]

        if (env.REPROCCESS) {
            recentDays.push(new Date(currentYear, currentMonth, currentDay - 1).getDate())
        }

        logger.debug(`Dias recentes considerados: ${recentDays.join(", ")}`)

        for (const day of daysDownload) {
            if (recentDays.includes(day)) {
                const initialPeriod = new Date(currentYear, currentMonth, 1)
                const finalPeriod = new Date(currentYear, currentMonth, day)
                periods.push({ initialPeriod, finalPeriod })

                logger.info(`Adicionado período: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}`)
            }
        }
    }

    if (!hasYearMonthRange && !hasDaysDownload) {
        logger.info("Calculando período padrão, pois nenhuma configuração específica foi encontrada...")

        const daysDownloadInitial = [1, 2, 3, 4, 5]
        if (daysDownloadInitial.includes(currentDay)) {
            const initialPeriod = new Date(currentYear, currentMonth - 1, 1)
            const finalPeriod = new Date(currentYear, currentMonth, 0)
            periods.push({ initialPeriod, finalPeriod })

            logger.info(`Adicionado período inicial: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}`)
        } else {
            const initialPeriod = new Date(currentYear, currentMonth, 1)
            const finalPeriod = currentDay > 1
                ? new Date(currentYear, currentMonth, currentDay - 1)
                : new Date(currentYear, currentMonth, 1)
    
            periods.push({ initialPeriod, finalPeriod })
            logger.info(`Adicionado período padrão: ${initialPeriod.toLocaleDateString()} - ${finalPeriod.toLocaleDateString()}`)
        }
    }

    logger.info("Cálculo dos períodos concluído.")

    return periods
}
