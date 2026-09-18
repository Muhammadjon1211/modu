import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { PaymentService } from './payment.service';
import { PaymentMethod } from '../../libs/dto/payment/payment';
import { PaymentInput } from '../../libs/dto/payment/payment.input';
import { PaymentMethodUpdate } from '../../libs/dto/payment/payment.update';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class PaymentResolver {
	constructor(private readonly paymentService: PaymentService) {}

	@UseGuards(AuthGuard)
	@Query(() => [PaymentMethod])
	public async getMyPaymentMethods(@AuthMember('_id') memberId: ObjectId): Promise<PaymentMethod[]> {
		console.log('Query: getMyPaymentMethods');
		return await this.paymentService.getMyPaymentMethods(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => PaymentMethod)
	public async createPaymentMethod(
		@Args('input') input: PaymentInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<PaymentMethod> {
		console.log('Mutation: createPaymentMethod');
		return await this.paymentService.createPaymentMethod(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => PaymentMethod)
	public async updatePaymentMethod(
		@Args('input') input: PaymentMethodUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<PaymentMethod> {
		console.log('Mutation: updatePaymentMethod');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.paymentService.updatePaymentMethod(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => PaymentMethod)
	public async removePaymentMethod(
		@Args('paymentId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<PaymentMethod> {
		console.log('Mutation: removePaymentMethod');
		return await this.paymentService.removePaymentMethod(memberId, shapeIntoMongoObjectId(input));
	}
}
