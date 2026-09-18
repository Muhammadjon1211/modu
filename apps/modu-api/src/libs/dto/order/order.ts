import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { OrderStatus } from '../../enums/order.enum';
import { Member, TotalCounter } from '../member/member';
import { Product } from '../product/product';
import { OrderShipping } from '../address/address';
import { OrderPayment } from '../payment/payment';

@ObjectType()
export class OrderItem {
	@Field(() => String) _id: ObjectId;

	@Field(() => Int) itemQuantity: number;

	@Field(() => Float) itemPrice: number;

	@Field(() => Int) itemDiscount: number;

	@Field(() => String, { nullable: true }) itemSize?: string;

	@Field(() => String, { nullable: true }) itemColor?: string;

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

	/** when the cart became an order — the return window runs from here */
	@Field(() => Date, { nullable: true }) purchasedAt?: Date;

	@Field(() => OrderShipping, { nullable: true }) orderShipping?: OrderShipping;

	@Field(() => OrderPayment, { nullable: true }) orderPayment?: OrderPayment;

	@Field(() => Date, { nullable: true }) deletedAt?: Date;

	@Field(() => Date) createdAt: Date;

	@Field(() => Date) updatedAt: Date;

	/** from aggregation **/
	@Field(() => [OrderItem], { nullable: true }) orderItems?: OrderItem[];

	@Field(() => [Product], { nullable: true }) productData?: Product[];

	/** the buyer — admin lists only */
	@Field(() => Member, { nullable: true }) memberData?: Member;
}

@ObjectType()
export class Orders {
	@Field(() => [Order]) list: Order[];

	@Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}

/** one buyer of a store, rolled up over the store's lines in paid orders */
@ObjectType()
export class StoreCustomer {
	@Field(() => String) _id: ObjectId;

	@Field(() => Int) orderCount: number;

	@Field(() => Int) unitsBought: number;

	@Field(() => Float) totalSpent: number;

	@Field(() => Date, { nullable: true }) lastOrderAt?: Date;

	/** from aggregation **/
	@Field(() => Member, { nullable: true }) memberData?: Member;
}

@ObjectType()
export class StoreCustomers {
	@Field(() => [StoreCustomer]) list: StoreCustomer[];

	@Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}

/** a store's sales at a glance — only PROCESS and FINISH orders count as sold */
@ObjectType()
export class StoreSummary {
	@Field(() => Int) orderCount: number;

	@Field(() => Int) unitsSold: number;

	@Field(() => Float) grossSales: number;

	@Field(() => Int) customerCount: number;
}
