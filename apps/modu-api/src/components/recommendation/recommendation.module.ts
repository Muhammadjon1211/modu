import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import ProductSchema from '../../schemas/Product.model';
import ViewSchema from '../../schemas/View.model';
import LikeSchema from '../../schemas/Like.model';
import FollowSchema from '../../schemas/Follow.model';
import OrderSchema from '../../schemas/Order.model';
import OrderItemSchema from '../../schemas/OrderItem.model';
import { RecommendationResolver } from './recommendation.resolver';
import { RecommendationService } from './recommendation.service';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [
		// read-only: the recommender only reads the activity other features write
		MongooseModule.forFeature([
			{ name: 'Product', schema: ProductSchema },
			{ name: 'View', schema: ViewSchema },
			{ name: 'Like', schema: LikeSchema },
			{ name: 'Follow', schema: FollowSchema },
			{ name: 'Order', schema: OrderSchema },
			{ name: 'OrderItem', schema: OrderItemSchema },
		]),
		AuthModule, // the resolver uses guards
	],
	providers: [RecommendationResolver, RecommendationService],
	exports: [RecommendationService],
})
export class RecommendationModule {}
