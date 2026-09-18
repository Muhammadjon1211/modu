import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { OrderPayment, PaymentMethod } from '../../libs/dto/payment/payment';
import { PaymentInput } from '../../libs/dto/payment/payment.input';
import { PaymentMethodUpdate } from '../../libs/dto/payment/payment.update';
import { PaymentType } from '../../libs/enums/payment.enum';
import { Message } from '../../libs/enums/common.enum';

/** what survives a PaymentInput: enough to recognise the method, never enough to charge it */
export interface PaymentSnapshot extends OrderPayment {
	expMonth?: number;
	expYear?: number;
}

@Injectable()
export class PaymentService {
	constructor(@InjectModel('PaymentMethod') private readonly paymentModel: Model<PaymentMethod>) {}

	public async getMyPaymentMethods(memberId: ObjectId): Promise<PaymentMethod[]> {
		return await this.paymentModel
			.find({ memberId })
			.sort({ isDefault: -1, updatedAt: -1 })
			.lean<PaymentMethod[]>()
			.exec();
	}

	public async createPaymentMethod(memberId: ObjectId, input: PaymentInput): Promise<PaymentMethod> {
		const snapshot = this.toSnapshot(input);
		const count = await this.paymentModel.countDocuments({ memberId }).exec();
		const isDefault = count === 0 || !!input.isDefault;
		if (isDefault) await this.clearDefault(memberId);

		return await this.paymentModel.create({ ...snapshot, memberId, isDefault });
	}

	public async updatePaymentMethod(memberId: ObjectId, input: PaymentMethodUpdate): Promise<PaymentMethod> {
		if (input.isDefault) await this.clearDefault(memberId);
		const result = await this.paymentModel
			.findOneAndUpdate({ _id: input._id, memberId }, input, { new: true })
			.exec();
		if (!result) throw new NotFoundException(Message.UPDATE_FAILED);
		return result;
	}

	public async removePaymentMethod(memberId: ObjectId, paymentId: ObjectId): Promise<PaymentMethod> {
		const result = await this.paymentModel.findOneAndDelete({ _id: paymentId, memberId }).exec();
		if (!result) throw new NotFoundException(Message.REMOVE_FAILED);

		if (result.isDefault) {
			const next = await this.paymentModel.findOne({ memberId }).sort({ updatedAt: -1 }).exec();
			if (next) await this.paymentModel.updateOne({ _id: next._id }, { isDefault: true }).exec();
		}
		return result;
	}

	/** for checkout — the method must belong to the buyer, and a saved card must still be valid */
	public async readOwned(memberId: ObjectId, paymentId: ObjectId): Promise<PaymentSnapshot> {
		const result = await this.paymentModel.findOne({ _id: paymentId, memberId }).lean<PaymentMethod>().exec();
		if (!result) throw new NotFoundException(Message.PAYMENT_REQUIRED);
		if (result.paymentType === PaymentType.CARD) this.assertNotExpired(result.expMonth, result.expYear);
		return result;
	}

	/**
	 * Validates what the buyer typed and reduces it to a masked snapshot.
	 * The full card / account number is not returned and is never persisted.
	 */
	public toSnapshot(input: PaymentInput): PaymentSnapshot {
		const holderName = input.holderName.trim();

		if (input.paymentType === PaymentType.CARD) {
			const digits = (input.cardNumber ?? '').replace(/[\s-]/g, '');
			if (!/^\d{13,19}$/.test(digits) || !this.passesLuhn(digits)) throw new BadRequestException(Message.INVALID_CARD);
			this.assertNotExpired(input.expMonth, input.expYear);
			return {
				paymentType: PaymentType.CARD,
				holderName,
				provider: this.cardBrand(digits),
				last4: digits.slice(-4),
				expMonth: input.expMonth,
				expYear: input.expYear,
			};
		}

		const account = (input.accountNumber ?? '').replace(/[\s-]/g, '');
		const bankName = (input.bankName ?? '').trim();
		if (!/^\d{6,20}$/.test(account) || !bankName) throw new BadRequestException(Message.INVALID_ACCOUNT);
		return {
			paymentType: PaymentType.BANK,
			holderName,
			provider: bankName,
			last4: account.slice(-4),
		};
	}

	private assertNotExpired(month?: number, year?: number): void {
		if (!month || !year) throw new BadRequestException(Message.CARD_EXPIRED);
		// a card is valid through the last day of its expiry month
		const end = moment({ year, month: month - 1, day: 1 }).endOf('month');
		if (moment().isAfter(end)) throw new BadRequestException(Message.CARD_EXPIRED);
	}

	/** the checksum every card number carries — catches typos before anything else */
	private passesLuhn(digits: string): boolean {
		let sum = 0;
		for (let i = 0; i < digits.length; i++) {
			let n = Number(digits[digits.length - 1 - i]);
			if (i % 2 === 1) {
				n *= 2;
				if (n > 9) n -= 9;
			}
			sum += n;
		}
		return sum % 10 === 0;
	}

	private cardBrand(digits: string): string {
		if (/^9860/.test(digits)) return 'HUMO';
		if (/^8600/.test(digits)) return 'UZCARD';
		if (/^4/.test(digits)) return 'VISA';
		if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'MASTERCARD';
		if (/^3[47]/.test(digits)) return 'AMEX';
		if (/^35/.test(digits)) return 'JCB';
		if (/^62/.test(digits)) return 'UNIONPAY';
		return 'CARD';
	}

	private async clearDefault(memberId: ObjectId): Promise<void> {
		await this.paymentModel.updateMany({ memberId, isDefault: true }, { isDefault: false }).exec();
	}
}
