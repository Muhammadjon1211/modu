import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty } from 'class-validator';
import { ObjectId } from 'mongoose';
import { OrderStatus } from '../../enums/order.enum';

@InputType()
export class OrderUpdate {
	@IsNotEmpty()
	@Field(() => String)
	_id: ObjectId;

	@IsNotEmpty()
	@Field(() => OrderStatus)
	orderStatus: OrderStatus;

	deletedAt?: Date; // server-set only
}
