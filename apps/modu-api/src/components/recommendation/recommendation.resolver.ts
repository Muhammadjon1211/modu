import { UseGuards } from '@nestjs/common';
import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { ObjectId } from 'mongoose';
import { RecommendationService } from './recommendation.service';
import { Recommendations } from '../../libs/dto/recommendation/recommendation';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { WithoutGuard } from '../auth/guards/without.guard';

@Resolver()
export class RecommendationResolver {
	constructor(private readonly recommendationService: RecommendationService) {}

	/** personal picks for a member with activity; trending / best sellers for everyone else */
	@UseGuards(WithoutGuard)
	@Query(() => Recommendations)
	public async getRecommendations(
		@Args('limit', { type: () => Int, nullable: true }) limit: number,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Recommendations> {
		console.log('Query: getRecommendations');
		const size = Math.min(Math.max(limit ?? 8, 1), 24);
		return await this.recommendationService.getRecommendations(memberId, size);
	}
}
