import path from "path"
import fs from "fs"

import { chromium, Browser, BrowserContext, Page } from "playwright"
import AdmZip from 'adm-zip'

import Note, { INote } from "@models/Note"

import env from "@utils/env"
import { logger } from "@utils/logger"

interface IRow {
    sit: string
    file: string
    date: string
    obs: string
    linkDownload?: string
}

export class NoteService {
    note: INote
    browser!: Browser
    context!: BrowserContext
    page!: Page
    continue: boolean

    constructor(note: INote) {
        this.note = note
        this.continue = true
    }

    private getStructure(print: boolean = false): string {
        const origin = env.STRUCTURE || 'C:\\notes'

        const date = new Date(this.note.initialPeriod)
        const year = date.getFullYear().toString()
        const month = (date.getMonth() + 1).toString().padStart(2, '0')

        const basePath = path.resolve(origin, this.note.modelNote, `${this.note.company.codeCompanieAccountSystem}-`, `${month}${year}`)
        const finalPath = print ? path.join(basePath, 'prints') : basePath

        if (!fs.existsSync(finalPath)) {
            fs.mkdirSync(finalPath, { recursive: true })
        }

        return finalPath
    }

    private async screenshot(pathname: string): Promise<string> {
        const dateTimeString = new Date().toLocaleString().replace(/[^a-zA-Z0-9]/g, '')
        const name = `${dateTimeString}.png`
        const pathScreenshot = path.join(pathname, name)
        await this.page.screenshot({ path: path.resolve(pathScreenshot) })
        return pathScreenshot
    }

    private async checkIfNoCpfDataFound(): Promise<void> {
        if (!this.continue) return

        try {
            const alert = this.page.getByText('×FecharNão foram encontrados')
            if (await alert.isVisible()) {
                const screenshotPath = this.getStructure(true)
                const screenshot = await this.screenshot(screenshotPath)

                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        screenshot,
                        statusNote: 'Warning',
                        warn: 'Não foram encontrados dados para o CNPJ do certificado.',
                    },
                    { upsert: true, new: true }
                )

                logger.warn('Não foram encontrados dados para o CNPJ do certificado.')

                await this.page.close()
                await this.browser.close()
            }
        } catch (error) {
            logger.error(`Erro ao verificar dados do CNPJ: ${error}`)

            await this.page.close()
            await this.browser.close()
        }
    }

    private async selectCnpjField() {
        if (!this.continue) {
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Warning',
                    warn: 'Processo interrompido: Campo CNPJ não selecionado.',
                },
                { upsert: true, new: true }
            )
            return
        }

        await this.page.locator('#cmpCnpj').selectOption(this.note.company.federalRegistration)
    }

    private async insertPeriodField(field: string, period: Date) {
        if (!this.continue) {
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Warning',
                    warn: `Processo interrompido: Campo de período (${field}) não preenchido.`,
                },
                { upsert: true, new: true }
            )
            return
        }

        const input = await this.page.waitForSelector(field)

        await this.page.evaluate((input: any) => {
            input.value = ''
        }, input)

        await this.page.click(field)
        await this.page.locator(field).press('Control+A')
        await this.page.locator(field).press('Backspace')

        const data = new Date(period).toLocaleDateString()
        await this.page.type(field, data)
    }

    private async insertSitField() {
        if (!this.continue) {
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Warning',
                    warn: 'Processo interrompido: Situação não selecionada.',
                },
                { upsert: true, new: true }
            )
            return
        }

        if (this.note.sitNote == 'Autorizadas') {
            await this.page.locator('#cmpSituacao').selectOption('2')
        } else {
            await this.page.locator('#cmpSituacao').selectOption('3')
        }
    }

    private async insertModelField() {
        if (!this.continue) {
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Warning',
                    warn: 'Processo interrompido: Modelo não selecionado.',
                },
                { upsert: true, new: true }
            )
            return
        }

        if (this.note.modelNote === 'NF-e') {
            await this.page.locator('#cmpModelo').selectOption('55')
        } else if (this.note.modelNote === 'CT-e') {
            await this.page.locator('#cmpModelo').selectOption('57')
        } else {
            await this.page.locator('#cmpModelo').selectOption('65')
        }
    }

    private async insertForm() {
        await this.selectCnpjField()
        await this.insertPeriodField('input[name="cmpDataInicial"]', this.note.initialPeriod)
        await this.insertPeriodField('input[name="cmpDataFinal"]', this.note.finalPeriod)
        await this.insertSitField()
        await this.insertModelField()
    }

    private async thowCaptcha(): Promise<void> {
        if (!this.continue) return

        try {
            const siteKey = await this.page.getAttribute('[data-callback="pegarTokenSuccess"]', "data-sitekey")
            if (!siteKey) {
                logger.error("Sitekey não encontrada na página!")
                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        statusNote: 'Error',
                        warn: 'Sitekey do captcha não encontrada.',
                    },
                    { upsert: true, new: true }
                )
                return
            }

            logger.info(`Sitekey encontrada: ${siteKey}`)

            const captchaToken = "success"
            if (!captchaToken) {
                logger.error("Não foi possível resolver o captcha!")
                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        statusNote: 'Error',
                        warn: 'Falha ao resolver o captcha.',
                    },
                    { upsert: true, new: true }
                )
                return
            }

            await this.page.evaluate((token: any) => {
                const input = document.getElementById("cf-turnstile-response") as HTMLInputElement
                if (input) input.value = token
            }, captchaToken)

            logger.info("Token injetado no formulário.")
        } catch (error) {
            logger.error(`Erro ao processar o captcha: ${error}`)
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Error',
                    warn: `Erro ao processar o captcha: ${error}`,
                },
                { upsert: true, new: true }
            )
        }
    }

    private async search() {
        if (!this.continue) return

        try {
            const [newTab] = await Promise.all([
                this.page.waitForEvent('domcontentloaded'),
                this.page.getByRole('button', { name: 'Pesquisar' }).click(),
            ])

            this.page = newTab
        } catch (error) {
            logger.error(`Erro ao realizar a pesquisa: ${error}`)

            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Error',
                    warn: 'Não foi possível carregar o resultado da pesquisa.',
                },
                { upsert: true, new: true }
            )

            await this.page.close()
            await this.browser.close()
        }
    }

    private async checkIfNoResult(): Promise<void> {
        if (!this.continue) return

        try {
            const noResultAlert = this.page.getByText('×FecharSem Resultados!')
            if (await noResultAlert.isVisible()) {
                this.continue = false
                const screenshotPath = this.getStructure(true)
                const screenshot = await this.screenshot(screenshotPath)

                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        screenshot,
                        statusNote: 'Warning',
                        warn: 'Sem resultados encontrados!',
                    },
                    { upsert: true, new: true }
                )

                logger.warn('Sem resultados encontrados para a pesquisa.')

                await this.page.close()
                await this.browser.close()
            }
        } catch (error) {
            logger.error(`Erro ao verificar resultados: ${error}`)

            const screenshotPath = this.getStructure(true)
            const screenshot = await this.screenshot(screenshotPath)

            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    screenshot,
                    statusNote: 'Error',
                    warn: `Erro ao verificar resultados: ${error}`,
                },
                { upsert: true, new: true }
            )

            await this.page.close()
            await this.browser.close()
        }
    }

    private async checkFilesWithTheSameParameter(): Promise<void> {
        if (!this.continue) return

        try {
            const noResultAlert = this.page.getByText('×Já existe um arquivo com os mesmos parâmetros solicitados em processamento. Aguarde a finalização antes de solicitar novamente')
            if (await noResultAlert.isVisible()) {
                this.continue = false

                logger.warn('Já existe um arquivo com os mesmos parâmetros solicitados em processamento. Aguarde a finalização antes de solicitar novamente.')

                await this.page.close()
                await this.browser.close()
            }
        } catch (error) {
            logger.error(`Erro ao verificar resultados: ${error}`)

            const screenshotPath = this.getStructure(true)
            const screenshot = await this.screenshot(screenshotPath)

            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    screenshot,
                    statusNote: 'Error',
                    warn: `Erro ao verificar resultados: ${error}`,
                },
                { upsert: true, new: true }
            )

            await this.page.close()
            await this.browser.close()
        }
    }

    async extractFirstRowTable(): Promise<IRow> {
        // Aguarda a tabela estar visível
        await this.page.waitForSelector('table.tablesorter tbody tr')

        // Seleciona a primeira linha da tabela
        const firstRow = this.page.locator('table.tablesorter tbody tr').first()

        // Extrai os dados das colunas
        const sit = await firstRow.locator('.col-situacao').innerText()
        const file = await firstRow.locator('.col-arquivo').innerText()
        const date = await firstRow.locator('.col-data').innerText()
        const obs = await firstRow.locator('.col-observacoes').innerText()
        // const linkDownload = await firstRow.locator('.col-acoes a.btn-info').getAttribute('href')

        // Retorna o objeto com os dados
        return { sit, file, date, obs }
    }

    private async setQuantityOfNotesFound(): Promise<void> {
        if (!this.continue) return

        try {
            // Espera o container aparecer (até 5 segundos)
            const container = this.page.locator('.table-legend-right-container')
            await container.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null)

            // Se não existir, retorna null
            if (await container.count() === 0) return

            // Tenta pegar o número diretamente da <div> interna
            const innerDiv = container.locator('div')
            const hasInnerDiv = await innerDiv.count()

            let totalNotasText: string | null = null

            if (hasInnerDiv) {
                totalNotasText = await innerDiv.first().innerText()
            } else {
                // fallback: tenta extrair número do texto geral
                const text = await container.innerText()
                const match = text.match(/\d+/)
                totalNotasText = match ? match[0] : null
            }

            // Retorna o número como inteiro, se existir
            const quantityOfNotesFound = totalNotasText ? parseInt(totalNotasText, 10) : 0

            if (quantityOfNotesFound > 0) {
                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    { quantityOfNotesFound },
                    { upsert: true, new: true },
                )
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            logger.error(`Erro ao tentar pegar a quantidade de notas fiscais econtradas: ${message}`)
        }
    }

    private async addToDownloadQueue(): Promise<void> {
        if (!this.continue) return

        try {
            await this.page.reload({ timeout: 1000 * 60 * 10 })

            // Rolagem automática até o final da página e captura do print da consulta
            await this.page.keyboard.press('End')
            const screenshotPath = this.getStructure(true)
            const screenshot = await this.screenshot(screenshotPath)

            await this.page.getByRole('button', { name: 'Baixar todos os arquivos' }).click()

            if (this.note.sitNote === 'Autorizadas') {
                await this.page.getByText('Baixar somente documentos').click()
            } else if (this.note.sitNote === 'Canceladas') {
                await this.page.getByText('Baixar somente eventos').click()
            } else {
                await this.page.getByText('Baixar documentos e eventos').click()
            }

            const downloadButton = this.page.getByRole('button', { name: 'Baixar', exact: true })

            await downloadButton.evaluate((button: HTMLButtonElement) => button.removeAttribute('disabled'))

            const [download] = await Promise.all([
                this.page.waitForEvent('domcontentloaded'),
                downloadButton.click(),
            ])

            const url = download.url()
            const { file } = await this.extractFirstRowTable()

            if (url && file) {
                logger.info(`URL do download: ${url}`)
                logger.info(`Nome do arquivo: ${file}`)

                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        fileName: file,
                        linkDownload: url,
                        statusNote: 'DonwloadPending',
                        screenshot
                    },
                    { upsert: true, new: true }
                )
            } else {
                this.continue = false
                logger.warn('Não foi possível obter a URL ou o nome do arquivo para download.')

                const screenshotPath = this.getStructure(true)
                const screenshot = await this.screenshot(screenshotPath)

                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        screenshot,
                        statusNote: 'Error',
                        warn: `Não foi possível obter a URL ou o nome do arquivo para download.`,
                    },
                    { upsert: true, new: true }
                )
            }
        } catch (error) {
            logger.error(`Erro ao adicionar à fila de download: ${error}`)

            const screenshotPath = this.getStructure(true)
            const screenshot = await this.screenshot(screenshotPath)

            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    screenshot,
                    statusNote: 'Error',
                    warn: `Erro ao adicionar à fila de download: ${error}`,
                },
                { upsert: true, new: true }
            )

            await this.page.close()
            await this.browser.close()
        }
    }

    private async conferenceScreenshot(): Promise<string> {
        await this.page.keyboard.press('End')
        const screenshotPath = this.getStructure(true)
        const screenshot = await this.screenshot(screenshotPath)
        return screenshot
    }

    async setDownloadLink(): Promise<void> {
        try {
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Processing',
                },
                { upsert: true, new: true }
            )

            this.browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 500 })
            this.context = await this.browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
            this.page = await this.context.newPage()

            // 5 minutos para navegação
            this.page.setDefaultTimeout(1000 * 60 * 5)
            this.page.setDefaultNavigationTimeout(1000 * 60 * 5)

            await this.page.goto("https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-publica", {
                waitUntil: "domcontentloaded"
            })

            await this.checkIfNoCpfDataFound()
            await this.insertForm()
            await this.thowCaptcha()
            await this.search()
            await this.checkIfNoResult()
            await this.checkFilesWithTheSameParameter()
            await this.setQuantityOfNotesFound()
            await this.addToDownloadQueue()
        } catch (error) {
            // Um catch genérico para capturar erros inesperados (como o timeout do page.goto)
            logger.error(`Erro inesperado no processo getDownloadLink: ${error}`)
            await Note.findOneAndUpdate(
                {
                    company: this.note.company,
                    modelNote: this.note.modelNote,
                    sitNote: this.note.sitNote,
                    initialPeriod: this.note.initialPeriod,
                    finalPeriod: this.note.finalPeriod,
                },
                {
                    statusNote: 'Error',
                    warn: `Falha crítica no site do sefaz: ${error}`,
                },
                { upsert: true, new: true }
            )
        } finally {
            logger.info("Finalizando processo getDownloadLink e fechando o navegador.")
            if (this.page && !this.page.isClosed()) {
                await this.page.close()
            }
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close()
            }
        }
    }

    async downloadFile() {
        try {
            this.browser = await chromium.launch({ channel: "chrome", headless: false, slowMo: 500 })
            this.context = await this.browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true })
            this.page = await this.context.newPage()

            if (!this.note.linkDownload) {
                logger.info('Link de download não disponível.')
                return
            }

            await this.page.goto(this.note.linkDownload, { waitUntil: 'domcontentloaded', timeout: 60000 })
            await this.page.waitForSelector('table.tablesorter tbody tr')

            let line
            if (this.note.fileName) {
                line = this.page.locator(`table.tablesorter tbody tr:has(td.col-arquivo:has-text("${this.note.fileName}"))`)
                if (await line.count() === 0) {
                    logger.info(`Arquivo "${this.note.fileName}" não encontrado na tabela.`)
                    return null
                }
            } else {
                line = this.page.locator('table.tablesorter tbody tr').first()
            }

            const linkDownload = await line.locator('.col-acoes a.btn-info').getAttribute('href')
            if (!linkDownload) {
                logger.info(`Arquivo ${this.note.fileName || '(primeira linha)'} encontrado, mas sem link de download.`)
                return null
            }

            const [download] = await Promise.all([
                this.page.waitForEvent('download'),
                line.locator('.col-acoes a.btn-info').click()
            ])

            const pathRelativeNote = this.getStructure()
            const filename = download.suggestedFilename() || ''
            const pathRelativeAbsolute = path.resolve(path.join(pathRelativeNote, filename))

            await download.saveAs(pathRelativeAbsolute)

            if (fs.existsSync(pathRelativeAbsolute)) {
                // Conta os arquivos dentro do ZIP
                let quantityOfNotesDownloaded = 0
                try {
                    const zip = new AdmZip(pathRelativeAbsolute)
                    const entries = zip.getEntries()
                    quantityOfNotesDownloaded = entries.length
                    logger.info(`Quantidade de arquivos dentro do ZIP: ${quantityOfNotesDownloaded}`)
                } catch (zipError) {
                    logger.error(`Erro ao ler o ZIP: ${zipError}`)
                }

                logger.info('Download realizado com sucesso.')

                await Note.findOneAndUpdate(
                    {
                        company: this.note.company,
                        modelNote: this.note.modelNote,
                        sitNote: this.note.sitNote,
                        initialPeriod: this.note.initialPeriod,
                        finalPeriod: this.note.finalPeriod,
                    },
                    {
                        filePath: pathRelativeAbsolute,
                        statusNote: 'Downloaded',
                        warn: '',
                        quantityOfNotesDownloaded,
                    },
                    { upsert: true, new: true }
                )
            }

            logger.info(`Arquivo salvo em: ${pathRelativeAbsolute}`)

        } catch (error) {
            logger.error(`Erro inesperado no processo downloadFile: ${error}`)
        } finally {
            logger.info("Finalizando processo downloadFile e fechando o navegador.")
            if (this.page && !this.page.isClosed()) {
                await this.page.close()
            }
            if (this.browser && this.browser.isConnected()) {
                await this.browser.close()
            }
        }
    }
}
