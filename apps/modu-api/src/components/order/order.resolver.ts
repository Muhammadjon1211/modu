import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { OrderService } from './order.service';
import { Order, Orders, StoreCustomers, StoreSummary } from '../../libs/dto/order/order';
import {
	AllOrdersInquiry,
	CartItemUpdate,
	OrderInput,
	OrderItemInput,
	OrdersInquiry,
	StoreCustomersInquiry,
} from '../../libs/dto/order/order.input';
import { OrderUpdate } from '../../libs/dto/order/order.update';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class OrderResolver {
	constructor(private readonly orderService: OrderService) {}

	@UseGuards(AuthGuard)
	@Query(() => Order)
	public async getMyCart(@AuthMember('_id') memberId: ObjectId): Promise<Order> {
		console.log('Query: getMyCart');
		return await this.orderService.getMyCart(memberId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async addToCart(
		@Args('input') input: OrderItemInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: addToCart');
		input.productId = shapeIntoMongoObjectId(input.productId);
		return await this.orderService.addToCart(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async removeFromCart(
		@Args('orderItemId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: removeFromCart');
		return await this.orderService.removeFromCart(memberId, shapeIntoMongoObjectId(input));
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async updateCartItem(
		@Args('input') input: CartItemUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: updateCartItem');
		input.orderItemId = shapeIntoMongoObjectId(input.orderItemId);
		return await this.orderService.updateCartItem(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async createOrder(
		@Args('input') input: OrderInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: createOrder');
		return await this.orderService.createOrder(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async updateOrder(
		@Args('input') input: OrderUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: updateOrder');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.orderService.updateOrder(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Orders)
	public async getMyOrders(
		@Args('input') input: OrdersInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Orders> {
		console.log('Query: getMyOrders');
		return await this.orderService.getMyOrders(memberId, input);
	}

	@Roles(MemberType.SELLER)
	@UseGuards(RolesGuard)
	@Query(() => Orders)
	public async getSellerOrders(
		@Args('input') input: OrdersInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Orders> {
		console.log('Query: getSellerOrders');
		return await this.orderService.getSellerOrders(memberId, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Orders)
	public async getAllOrdersByAdmin(@Args('input') input: AllOrdersInquiry): Promise<Orders> {
		console.log('Query: getAllOrdersByAdmin');
		return await this.orderService.getAllOrdersByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => StoreCustomers)
	public async getStoreCustomersByAdmin(@Args('input') input: StoreCustomersInquiry): Promise<StoreCustomers> {
		console.log('Query: getStoreCustomersByAdmin');
		return await this.orderService.getStoreCustomersByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => StoreSummary)
	public async getStoreSummaryByAdmin(@Args('sellerId') input: string): Promise<StoreSummary> {
		console.log('Query: getStoreSummaryByAdmin');
		const sellerId = shapeIntoMongoObjectId(input);
		return await this.orderService.getStoreSummaryByAdmin(sellerId);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Order)
	public async updateOrderByAdmin(@Args('input') input: OrderUpdate): Promise<Order> {
		console.log('Mutation: updateOrderByAdmin');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.orderService.updateOrderByAdmin(input);
	}
}
