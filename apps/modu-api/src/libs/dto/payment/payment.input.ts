import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, Length, Max, MaxLength, Min } from 'class-validator';
import { PaymentType } from '../../enums/payment.enum';

/**
 * What the buyer types in. The full number only lives for the length of the request:
 * it is validated, reduced to brand + last4, and dropped. No CVV is ever asked for.
 */
@InputType()
export class PaymentInput {
	@IsNotEmpty()
	@IsIn(Object.values(PaymentType))
	@Field(() => PaymentType)
	paymentType: PaymentType;

	@IsNotEmpty()
	@Length(2, 60)
	@Field(() => String)
	holderName: string;

	/** CARD — only capped here; PaymentService gives the real, readable verdict */
	@IsOptional()
	@MaxLength(40)
	@Field(() => String, { nullable: true })
	cardNumber?: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(12)
	@Field(() => Int, { nullable: true })
	expMonth?: number;

	@IsOptional()
	@IsInt()
	@Min(2000)
	@Max(2100)
	@Field(() => Int, { nullable: true })
	expYear?: number;

	/** BANK */
	@IsOptional()
	@Length(2, 40)
	@Field(() => String, { nullable: true })
	bankName?: string;

	@IsOptional()
	@MaxLength(40)
	@Field(() => String, { nullable: true })
	accountNumber?: string;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	isDefault?: boolean;
}
