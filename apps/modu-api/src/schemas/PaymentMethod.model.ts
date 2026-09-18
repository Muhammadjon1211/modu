import { Schema } from 'mongoose';
import { PaymentType } from '../libs/enums/payment.enum';

/**
 * A saved payment option. Only what is needed to recognise it is kept — the holder,
 * the brand or bank, and the last four digits. Full card / account numbers and CVVs
 * are never stored; a real charge belongs to a payment gateway.
 */
const PaymentMethodSchema = new Schema(
	{
		paymentType: { type: String, enum: PaymentType, required: true },
		holderName: { type: String, required: true },
		/** card brand (VISA, MASTERCARD, ...) or bank name */
		provider: { type: String, required: true },
		last4: { type: String, required: true },
		expMonth: { type: Number },
		expYear: { type: Number },
		isDefault: { type: Boolean, default: false },

		memberId: { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
	},
	{ timestamps: true, collection: 'paymentMethods' },
);

PaymentMethodSchema.index({ memberId: 1 });

export default PaymentMethodSchema;
