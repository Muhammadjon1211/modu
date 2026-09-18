import { Field, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';

@ObjectType()
export class Address {
	@Field(() => String) _id: ObjectId;

	@Field(() => String) recipientName: string;

	@Field(() => String) recipientPhone: string;

	@Field(() => String) addressLine1: string;

	@Field(() => String, { nullable: true }) addressLine2?: string;

	@Field(() => String) city: string;

	@Field(() => String, { nullable: true }) postalCode?: string;

	@Field(() => Boolean) isDefault: boolean;

	@Field(() => String) memberId: ObjectId;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;
}

/** the copy an order keeps */
@ObjectType()
export class OrderShipping {
	@Field(() => String) recipientName: string;

	@Field(() => String) recipientPhone: string;

	@Field(() => String) addressLine1: string;

	@Field(() => String, { nullable: true }) addressLine2?: string;

	@Field(() => String) city: string;

	@Field(() => String, { nullable: true }) postalCode?: string;
}
