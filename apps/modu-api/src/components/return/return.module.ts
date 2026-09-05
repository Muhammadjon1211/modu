import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ReturnSchema from '../../schemas/Return.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import { ReturnResolver } from './return.resolver';
import { ReturnService } from './return.service';
import { AuthModule } from '../auth/auth.module';
import { MemberModule } from '../member/member.module';
import { ProductModule } from '../product/product.module';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Return', schema: ReturnSchema }]),
		// read-only: a return is validated against its order but never writes to it
		MongooseModule.forFeature([{ name: 'Order', schema: OrderSchema }]),
		MongooseModule.forFeature([{ name: 'OrderItem', schema: OrderItemSchema }]),
		AuthModule,
		MemberModule, // reverses the sale counters on completion
		ProductModule, // restores stock on completion
	],
	providers: [ReturnResolver, ReturnService],
	exports: [ReturnService],
})
export class ReturnModule {}
