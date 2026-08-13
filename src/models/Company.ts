import mongoose, { Document, Schema } from 'mongoose'

export interface ICompany extends Document {
    codeCompanieAccountSystem: number
    name: string
    nickName: string
    typeFederalRegistration: number
    federalRegistration: string
    status: string
    dddPhone: string
    phone: string
    email: string
    dateInicialAsCompanie: Date
    dateInicialAsClient: Date
    dateFinalAsClient: Date
    stateRegistration: string
    cityRegistration: number
    uf: string
    cnaes: string
    idIbgeCity: number
    taxRegime: number
    createdAt: Date
    updatedAt: Date
}

const CompanySchema: Schema = new Schema(
    {
        codeCompanieAccountSystem: { type: Number, required: true },
        name: { type: String, required: true },
        nickName: { type: String, required: true },
        typeFederalRegistration: { type: Number, required: true },
        federalRegistration: { type: String, required: true },
        status: { type: String, required: true },
        dddPhone: { type: String, required: true },
        phone: { type: String, required: true },
        email: { type: String, required: true },
        dateInicialAsCompanie: { type: Date, required: true },
        dateInicialAsClient: { type: Date, required: true },
        dateFinalAsClient: { type: Date, required: true },
        stateRegistration: { type: String, required: true },
        cityRegistration: { type: Number, required: true },
        uf: { type: String, required: true },
        cnaes: { type: String, required: true },
        idIbgeCity: { type: Number, required: true },
        taxRegime: { type: Number, required: true },
    },
    { timestamps: true },
)

export default mongoose.models.Company || mongoose.model<ICompany>('Company', CompanySchema)
