import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { PaymentType } from '../../enums/payment.enum';

@ObjectType()
export class PaymentMethod {
	@Field(() => String) _id: ObjectId;

	@Field(() => PaymentType) paymentType: PaymentType;

	@Field(() => String) holderName: string;

	@Field(() => String) provider: string;

	@Field(() => String) last4: string;

	@Field(() => Int, { nullable: true }) expMonth?: number;

	@Field(() => Int, { nullable: true }) expYear?: number;

	@Field(() => Boolean) isDefault: boolean;

	@Field(() => String) memberId: ObjectId;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;
}

/** the masked copy an order keeps */
@ObjectType()
export class OrderPayment {
	@Field(() => PaymentType) paymentType: PaymentType;

	@Field(() => String) holderName: string;

	@Field(() => String) provider: string;

	@Field(() => String) last4: string;
}
