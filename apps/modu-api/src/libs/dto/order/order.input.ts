import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ObjectId } from 'mongoose';
import { OrderStatus } from '../../enums/order.enum';
import { ProductColor, ProductSize } from '../../enums/product.enum';
import { AddressInput } from '../address/address.input';
import { PaymentInput } from '../payment/payment.input';
import { Direction } from '../../enums/common.enum';
import { availableOrderSorts } from '../../config';

/**
 * Only the product and the quantity come from the client.
 * Price, seller and totals are all resolved server-side from the live product.
 */
@InputType()
export class OrderItemInput {
	@IsNotEmpty()
	@Field(() => String)
	productId: ObjectId;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	itemQuantity: number;

	/** required whenever the product offers more than one size / color */
	@IsOptional()
	@Field(() => ProductSize, { nullable: true })
	itemSize?: ProductSize;

	@IsOptional()
	@Field(() => ProductColor, { nullable: true })
	itemColor?: ProductColor;
}

/** a cart line is addressed by its own id, since one product can sit in the cart in several sizes */
@InputType()
export class CartItemUpdate {
	@IsNotEmpty()
	@Field(() => String)
	orderItemId: ObjectId;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Field(() => Int)
	itemQuantity: number;
}

/**
 * Checkout. The lines come from the server-side cart, never from the client.
 * Shipping and payment are either a saved one (by id) or a new one, optionally saved.
 */
@InputType()
export class OrderInput {
	@IsOptional()
	@Field(() => String, { nullable: true })
	addressId?: ObjectId;

	@IsOptional()
	@ValidateNested()
	@Type(() => AddressInput)
	@Field(() => AddressInput, { nullable: true })
	shipping?: AddressInput;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	saveAddress?: boolean;

	@IsOptional()
	@Field(() => String, { nullable: true })
	paymentMethodId?: ObjectId;

	@IsOptional()
	@ValidateNested()
	@Type(() => PaymentInput)
	@Field(() => PaymentInput, { nullable: true })
	payment?: PaymentInput;

	@IsOptional()
	@IsBoolean()
	@Field(() => Boolean, { nullable: true })
	savePayment?: boolean;
}

@InputType()
class OISearch {
	@IsOptional()
	@Field(() => OrderStatus, { nullable: true })
	orderStatus?: OrderStatus;
}

@InputType()
export class OrdersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableOrderSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => OISearch)
	search: OISearch;
}

@InputType()
class ALOISearch {
	@IsOptional()
	@Field(() => OrderStatus, { nullable: true })
	orderStatus?: OrderStatus;

	@IsOptional()
	@Field(() => String, { nullable: true })
	memberId?: ObjectId;

	/** orders that contain at least one line of this store */
	@IsOptional()
	@Field(() => String, { nullable: true })
	sellerId?: ObjectId;
}

@InputType()
export class AllOrdersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsOptional()
	@IsIn(availableOrderSorts)
	@Field(() => String, { nullable: true })
	sort?: string;

	@IsOptional()
	@Field(() => Direction, { nullable: true })
	direction?: Direction;

	@IsNotEmpty()
	@Field(() => ALOISearch)
	search: ALOISearch;
}

@InputType()
class SCSearch {
	@IsNotEmpty()
	@Field(() => String)
	sellerId: ObjectId;
}

/** the buyers of one store — admin only */
@InputType()
export class StoreCustomersInquiry {
	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	page: number;

	@IsNotEmpty()
	@Min(1)
	@Field(() => Int)
	limit: number;

	@IsNotEmpty()
	@Field(() => SCSearch)
	search: SCSearch;
}
