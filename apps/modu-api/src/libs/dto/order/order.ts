import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { OrderStatus } from '../../enums/order.enum';
import { TotalCounter } from '../member/member';
import { Product } from '../product/product';

@ObjectType()
export class OrderItem {
	@Field(() => String) _id: ObjectId;

	@Field(() => Int) itemQuantity: number;

	@Field(() => Float) itemPrice: number;

	@Field(() => Int) itemDiscount: number;

	@Field(() => String) productId: ObjectId;

	@Field(() => String) sellerId: ObjectId;

	@Field(() => String) orderId: ObjectId;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;
}

@ObjectType()
export class Order {
	@Field(() => String) _id: ObjectId;

	@Field(() => OrderStatus) orderStatus: OrderStatus;

	@Field(() => Float) orderSubTotal: number;

	@Field(() => Float) orderDelivery: number;

	@Field(() => Float) orderTotal: number;

	@Field(() => String) memberId: ObjectId;

	@Field(() => Date, { nullable: true }) deletedAt?: Date;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;

	/** from aggregation **/
	@Field(() => [OrderItem], { nullable: true }) orderItems?: OrderItem[];

	@Field(() => [Product], { nullable: true }) productData?: Product[];
}

@ObjectType()
export class Orders {
	@Field(() => [Order]) list: Order[];

	@Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}
