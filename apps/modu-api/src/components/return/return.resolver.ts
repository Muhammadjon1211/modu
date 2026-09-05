import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { ReturnService } from './return.service';
import { Return, ReturnEligibility, Returns } from '../../libs/dto/return/return';
import { AllReturnsInquiry, ReturnInput, ReturnsInquiry } from '../../libs/dto/return/return.input';
import { ReturnUpdate } from '../../libs/dto/return/return.update';
import { MemberType } from '../../libs/enums/member.enum';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class ReturnResolver {
	constructor(private readonly returnService: ReturnService) {}

	@UseGuards(AuthGuard)
	@Mutation(() => Return)
	public async requestReturn(
		@Args('input') input: ReturnInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Return> {
		console.log('Mutation: requestReturn');
		input.orderItemId = shapeIntoMongoObjectId(input.orderItemId);
		return await this.returnService.requestReturn(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => ReturnEligibility)
	public async checkReturnEligibility(
		@Args('orderItemId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<ReturnEligibility> {
		console.log('Query: checkReturnEligibility');
		const orderItemId = shapeIntoMongoObjectId(input);
		return await this.returnService.checkReturnEligibility(memberId, orderItemId);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Return)
	public async cancelReturn(
		@Args('returnId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Return> {
		console.log('Mutation: cancelReturn');
		const returnId = shapeIntoMongoObjectId(input);
		return await this.returnService.cancelReturn(memberId, returnId);
	}

	@UseGuards(AuthGuard)
	@Query(() => Returns)
	public async getMyReturns(
		@Args('input') input: ReturnsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Returns> {
		console.log('Query: getMyReturns');
		return await this.returnService.getMyReturns(memberId, input);
	}

	@Roles(MemberType.SELLER)
	@UseGuards(RolesGuard)
	@Query(() => Returns)
	public async getSellerReturns(
		@Args('input') input: ReturnsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Returns> {
		console.log('Query: getSellerReturns');
		return await this.returnService.getSellerReturns(memberId, input);
	}

	@Roles(MemberType.SELLER)
	@UseGuards(RolesGuard)
	@Mutation(() => Return)
	public async updateReturn(
		@Args('input') input: ReturnUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Return> {
		console.log('Mutation: updateReturn');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.returnService.updateReturn(memberId, input);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Returns)
	public async getAllReturnsByAdmin(@Args('input') input: AllReturnsInquiry): Promise<Returns> {
		console.log('Query: getAllReturnsByAdmin');
		if (input.search?.memberId) input.search.memberId = shapeIntoMongoObjectId(input.search.memberId);
		if (input.search?.sellerId) input.search.sellerId = shapeIntoMongoObjectId(input.search.sellerId);
		return await this.returnService.getAllReturnsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Return)
	public async updateReturnByAdmin(@Args('input') input: ReturnUpdate): Promise<Return> {
		console.log('Mutation: updateReturnByAdmin');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.returnService.updateReturnByAdmin(input);
	}
}
