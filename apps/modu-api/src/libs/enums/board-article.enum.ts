import { registerEnumType } from '@nestjs/graphql';

export enum BoardArticleCategory {
	LOOKBOOK = 'LOOKBOOK',
	NEWS = 'NEWS',
	STYLE_TIP = 'STYLE_TIP',
	Q_AND_A = 'Q_AND_A',
}
registerEnumType(BoardArticleCategory, { name: 'BoardArticleCategory' });

export enum BoardArticleStatus {
	ACTIVE = 'ACTIVE',
	DELETE = 'DELETE',
}
registerEnumType(BoardArticleStatus, { name: 'BoardArticleStatus' });
