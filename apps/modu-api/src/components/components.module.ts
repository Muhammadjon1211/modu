import { Module } from '@nestjs/common';
import { MemberModule } from './member/member.module';
import { AuthModule } from './auth/auth.module';
import { BoardArticleModule } from './board-article/board-article.module';
import { ProductModule } from './product/product.module';
import { CommentModule } from './comment/comment.module';
import { LikeModule } from './like/like.module';
import { ViewModule } from './view/view.module';
import { FollowModule } from './follow/follow.module';
import { OrderModule } from './order/order.module';
import { ReturnModule } from './return/return.module';
import { NoticeModule } from './notice/notice.module';

/** Pure aggregator — AppModule imports this, never an individual feature. */
@Module({
	imports: [
		MemberModule,
		AuthModule,
		BoardArticleModule,
		ProductModule,
		CommentModule,
		LikeModule,
		ViewModule,
		FollowModule,
		OrderModule,
		ReturnModule,
		NoticeModule,
	],
})
export class ComponentsModule {}
