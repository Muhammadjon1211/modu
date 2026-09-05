# NestJS + GraphQL Backend — Project Structure & Architecture Guide

> **What this is.** A complete engineering specification reverse-engineered from a working
> NestJS 10 + GraphQL (code-first) + MongoDB monorepo (`nestar`, a real-estate marketplace).
> It documents the folder layout, file naming, layer responsibilities, module import/export graph,
> the business-logic patterns, and how every piece interacts with every other piece.
>
> **How to use it on a new project (clothing e-commerce).** Do **not** copy the real-estate
> entities. Copy the **structure, naming grammar, layering, module wiring and patterns**, and
> substitute your own domain nouns using the mapping table in §2. Everything in §12
> (View / Like / Follow / Comment / Notice / Notification) is reusable **verbatim** — only the
> group-enum members change.

---

## Table of contents

1. [Stack & baseline](#1-stack--baseline)
2. [Domain mapping — read before writing any code](#2-domain-mapping--read-this-before-writing-any-code)
3. [The 12 architectural laws](#3-the-12-architectural-laws)
4. [Folder structure](#4-folder-structure)
5. [Naming conventions](#5-naming-conventions)
6. [Bootstrap layer](#6-bootstrap-layer)
7. [Shared libs layer](#7-shared-libs-layer)
8. [Schema layer](#8-schema-layer)
9. [DTO layer](#9-dto-layer)
10. [Feature module layer](#10-feature-module-layer)
11. [Auth subsystem — three guards](#11-auth-subsystem--three-guards)
12. [Engagement subsystem — the reusable endpoints](#12-engagement-subsystem--the-reusable-endpoints)
13. [Module interaction map](#13-module-interaction-map--who-imports-who)
14. [Canonical aggregation patterns](#14-canonical-aggregation-patterns)
15. [Denormalized counters — the StatisticModifier pattern](#15-denormalized-counters--the-statisticmodifier-pattern)
16. [File upload](#16-file-upload)
17. [Batch (cron) application](#17-batch-cron-application)
18. [WebSocket layer](#18-websocket-layer)
19. [Error handling](#19-error-handling)
20. [Full GraphQL API surface of the reference project](#20-full-graphql-api-surface-of-the-reference-project)
21. [E-commerce API surface to build](#21-e-commerce-api-surface-to-build)
22. [Build order — do it in this sequence](#22-build-order--do-it-in-this-sequence)
23. [Known defects in the reference — fix these when copying](#23-known-defects-in-the-reference--fix-these-when-copying)

---

## 1. Stack & Baseline

| Concern | Choice |
|---|---|
| Framework | NestJS 10, **monorepo mode** (`nest-cli.json` → `"monorepo": true`) |
| API style | **GraphQL code-first** — `autoSchemaFile: true`, no hand-written `.graphql` files |
| GraphQL driver | Apollo (`@nestjs/apollo` + `@apollo/server` v4) |
| Database | MongoDB via **plain Mongoose schemas** (`new Schema({...})`, *not* `@Schema()` decorators) |
| Auth | JWT (`@nestjs/jwt`) + `bcryptjs`, **custom guards, no Passport** |
| Validation | `class-validator` on `@InputType()` DTOs + a global `ValidationPipe` |
| File upload | `graphql-upload` v13 + `graphqlUploadExpress` middleware → files written to `./uploads` |
| Config | `@nestjs/config` global, a single `.env` at repo root |
| Scheduled jobs | `@nestjs/schedule` in a **separate `-batch` app** |
| Realtime | `@nestjs/websockets` + `@nestjs/platform-ws` (raw `ws`, not socket.io) |
| Language | TypeScript 5, `target: ES2023`, decorators on, `noImplicitAny: false`, `strictNullChecks: true` |

### `package.json` scripts (keep these exact names)

```json
{
  "build": "nest build",
  "format": "prettier --write \"apps/**/*.ts\" \"libs/**/*.ts\"",
  "start": "nest start",
  "start:dev": "nest start --watch",
  "start:dev:batch": "nest start <project>-batch --watch",
  "start:debug": "nest start --debug --watch",
  "start:prod": "NODE_ENV=production node dist/apps/<project>-api/main",
  "start:prod:batch": "node dist/apps/<project>-batch/main",
  "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
  "test": "jest",
  "test:e2e": "jest --config ./apps/<project>-api/test/jest-e2e.json"
}
```

### `nest-cli.json` — the monorepo declaration

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "apps/<project>-api/src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true,
    "tsConfigPath": "apps/<project>-api/tsconfig.app.json"
  },
  "monorepo": true,
  "root": "apps/<project>-api",
  "projects": {
    "<project>-api": {
      "type": "application",
      "root": "apps/<project>-api",
      "entryFile": "main",
      "sourceRoot": "apps/<project>-api/src",
      "compilerOptions": { "tsConfigPath": "apps/<project>-api/tsconfig.app.json" }
    },
    "<project>-batch": {
      "type": "application",
      "root": "apps/<project>-batch",
      "entryFile": "main",
      "sourceRoot": "apps/<project>-batch/src",
      "compilerOptions": { "tsConfigPath": "apps/<project>-batch/tsconfig.app.json" }
    }
  }
}
```

Each app owns a `tsconfig.app.json` that extends the root one and only changes `outDir`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "declaration": false, "outDir": "../../dist/apps/<project>-api" },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "test", "**/*spec.ts"]
}
```

### `.env` (root, gitignored)

```
PORT_API=3007
PORT_BATCH=3008
MONGO_DEV=mongodb+srv://.../<project>-dev
MONGO_PROD=mongodb+srv://.../<project>-prod
SECRET_TOKEN=<random-long-string>
```

`.gitignore` must contain `/dist`, `/node_modules`, `.env`, `uploads`.

---

## 2. Domain Mapping — read this before writing any code

The reference project has **four tiers** of entity. Map your domain onto the same tiers; the whole
architecture follows from that decision.

| Tier | Reference | Role | Clothing e-commerce substitute |
|---|---|---|---|
| **A. Actor** | `Member` | The account: signup/login/JWT, roles, denormalized counters, profile image | `Member` (`USER \| SELLER \| ADMIN`) |
| **B. Primary resource** | `Property` | The main thing actors create/browse/search — owned by an actor, listed, faceted-filtered, paginated | `Product` |
| **B2. Secondary resource** | `BoardArticle` | Community/content entity, same shape as B but lighter | `BoardArticle` (lookbook / style blog) |
| **C. Engagement / join** | `View`, `Like`, `Follow`, `Comment`, `Notice`, `Notification` | Small polymorphic join collections referencing A and B via `<x>RefId` + `<x>Group` enum | **keep as-is**, only rename group-enum members |
| **D. Transaction** *(new for commerce)* | — | Cart / Order / OrderItem — see §21 | `Order`, `OrderItem` |

### The naming grammar — the single most important rule of this codebase

> **Every field of an entity is prefixed with the entity name in camelCase.**

`memberNick`, `memberStatus`, `memberViews`, `propertyTitle`, `propertyPrice`, `propertyImages`,
`articleTitle`, `commentContent`, `viewGroup`, `likeRefId`.

The **only** unprefixed fields are `_id`, `createdAt`, `updatedAt`, `deletedAt`, and foreign keys
(`memberId`, `authorId`, `receiverId`).

Apply the same grammar with your nouns:
`productTitle`, `productPrice`, `productSize`, `productStatus`, `orderTotal`, `orderStatus`.

### Concrete e-commerce entity map

```
Member          MemberType:     USER | SELLER | ADMIN
                MemberStatus:   ACTIVE | BLOCK | DELETE
                MemberAuthType: PHONE | EMAIL | TELEGRAM
                counters:       memberProducts, memberArticles, memberFollowers, memberFollowings,
                                memberPoints, memberLikes, memberViews, memberComments,
                                memberRank, memberWarnings, memberBlocks

Product         ProductStatus:   ACTIVE | SOLD_OUT | DELETE
                ProductCategory: TSHIRT | SHIRT | DRESS | JACKET | TROUSERS | SHOES | ACCESSORY
                ProductGender:   MEN | WOMEN | UNISEX | KIDS
                ProductSize:     XS | S | M | L | XL | XXL
                ProductColor:    BLACK | WHITE | RED | BLUE | GREEN | BEIGE | ...
                fields:          productTitle, productPrice, productDiscount, productStock,
                                 productImages[], productDesc, productBrand, productMaterial,
                                 productViews, productLikes, productComments, productRank,
                                 memberId (seller), soldOutAt, deletedAt

BoardArticle    articleCategory: LOOKBOOK | NEWS | STYLE_TIP | Q_AND_A   (was FREE|RECOMMEND|NEWS|HUMOR)

View / Like / Follow / Comment / Notice / Notification
                unchanged; every group enum becomes  MEMBER | PRODUCT | ARTICLE
```

---

## 3. The 12 Architectural Laws

These are what make the reference codebase clean. Break one and the structure degrades.

1. **Three files per feature.** `<feature>.module.ts`, `<feature>.resolver.ts`, `<feature>.service.ts`.
   No repository layer, no mapper layer, no DTO assembler. The service talks to Mongoose directly.
2. **Resolvers are thin.** A resolver may only: log the operation, attach guards, read the caller via
   `@AuthMember()`, convert string ids with `shapeIntoMongoObjectId()`, and delegate. Zero business
   logic, zero DB access.
3. **Services hold all business logic** — aggregations, counter updates, error throwing.
4. **One aggregator module.** `ComponentsModule` imports every feature module and nothing else;
   `AppModule` imports `ComponentsModule`, never individual features.
5. **Cross-feature work goes through exported services**, never through another feature's model.
   `ProductService` never injects `MemberModel`; it injects `MemberService` and calls
   `memberStatsEditor()`.
6. **Every list query returns `{ list, metaCounter }`**, produced by the same
   `$match → $sort → $facet` aggregation.
7. **Every list query takes exactly one argument** of shape `{ page, limit, sort?, direction?, search }`.
8. **`sort` is a raw string constrained by `@IsIn(availableXSorts)`** from `libs/config.ts` — the only
   defence against sort-field injection.
9. **Counters are denormalized on the parent document** and maintained by `<entity>StatsEditor`.
   Never `$count` a child collection at read time.
10. **Nothing is hard-deleted** except by an explicit admin cleanup mutation. Status enums carry a
    `DELETE` member and `deletedAt: Date` is stamped server-side.
11. **No inline error strings.** Every user-facing message lives in the `Message` enum in
    `libs/enums/common.enum.ts`.
12. **Every GraphQL enum is registered immediately after declaration** with
    `registerEnumType(X, { name: 'X' })`.

---

## 4. Folder Structure

```
<project>/                                   # repo root
├── .env                                     # gitignored
├── .prettierrc
├── .gitignore
├── .vscode/settings.json
├── eslint.config.mjs
├── nest-cli.json                            # monorepo: true
├── package.json
├── tsconfig.json                            # base config
├── tsconfig.build.json
├── uploads/                                 # runtime image storage, gitignored
│   ├── member/
│   ├── product/
│   └── article/
└── apps/
    ├── <project>-api/                       # the GraphQL server — 95% of the work
    │   ├── tsconfig.app.json
    │   ├── test/
    │   │   ├── app.e2e-spec.ts
    │   │   └── jest-e2e.json
    │   └── src/
    │       ├── main.ts                      # bootstrap
    │       ├── app.module.ts                # root: Config + GraphQL + Components + Database + Socket
    │       ├── app.controller.ts            # trivial REST health endpoint
    │       ├── app.service.ts               # returns a welcome string
    │       ├── app.resolver.ts              # trivial `sayHello` query
    │       │
    │       ├── components/                  # FEATURE MODULES — one folder per domain concept
    │       │   ├── components.module.ts     # aggregator; imports every feature module
    │       │   ├── auth/
    │       │   │   ├── auth.module.ts
    │       │   │   ├── auth.service.ts
    │       │   │   ├── decorators/
    │       │   │   │   ├── authMember.decorator.ts
    │       │   │   │   └── roles.decorator.ts
    │       │   │   └── guards/
    │       │   │       ├── auth.guard.ts
    │       │   │       ├── roles.guard.ts
    │       │   │       └── without.guard.ts
    │       │   ├── member/                  # Tier A actor
    │       │   │   ├── member.module.ts
    │       │   │   ├── member.resolver.ts
    │       │   │   └── member.service.ts
    │       │   ├── product/                 # Tier B primary resource
    │       │   ├── board-article/           # Tier B2 (kebab-case folder, kebab-case files)
    │       │   ├── comment/
    │       │   ├── like/                    # service only, no resolver
    │       │   ├── view/                    # service only, no resolver
    │       │   ├── follow/
    │       │   ├── order/                   # Tier D (e-commerce addition)
    │       │   └── notice/
    │       │
    │       ├── database/
    │       │   └── database.module.ts       # MongooseModule.forRootAsync + connection log
    │       │
    │       ├── libs/                        # SHARED, framework-agnostic building blocks
    │       │   ├── config.ts                # sort whitelists, image helpers, ObjectId helper,
    │       │   │                            #   and every reusable $lookup fragment
    │       │   ├── dto/                     # GraphQL types — one folder per entity
    │       │   │   ├── member/
    │       │   │   │   ├── member.ts         # @ObjectType()  — outputs
    │       │   │   │   ├── member.input.ts   # @InputType()   — create + inquiry inputs
    │       │   │   │   └── member.update.ts  # @InputType()   — update input
    │       │   │   ├── product/
    │       │   │   ├── board-article/
    │       │   │   ├── comment/
    │       │   │   ├── follow/
    │       │   │   ├── like/
    │       │   │   └── view/
    │       │   ├── enums/                   # one file per entity, kebab-case
    │       │   │   ├── common.enum.ts       # Message catalogue + Direction
    │       │   │   ├── member.enum.ts
    │       │   │   ├── product.enum.ts
    │       │   │   ├── board-article.enum.ts
    │       │   │   ├── comment.enum.ts
    │       │   │   ├── like.enum.ts
    │       │   │   ├── view.enum.ts
    │       │   │   ├── notice.enum.ts
    │       │   │   └── notification.enum.ts
    │       │   ├── types/
    │       │   │   └── common.ts            # T, StatisticModifier
    │       │   └── interceptor/
    │       │       └── Logging.interceptor.ts
    │       │
    │       ├── schemas/                     # Mongoose schemas — PascalCase + .model.ts
    │       │   ├── Member.model.ts
    │       │   ├── Product.model.ts
    │       │   ├── BoardArticle.model.ts
    │       │   ├── Comment.model.ts
    │       │   ├── Follow.model.ts
    │       │   ├── Like.model.ts
    │       │   ├── View.model.ts
    │       │   ├── Notice.model.ts
    │       │   └── Notification.model.ts
    │       │
    │       └── socket/
    │           ├── socket.gateway.ts
    │           └── socket.module.ts
    │
    └── <project>-batch/                     # cron / ranking worker
        ├── tsconfig.app.json
        ├── test/
        └── src/
            ├── main.ts
            ├── batch.module.ts
            ├── batch.controller.ts          # @Cron declarations live here
            ├── batch.service.ts             # the actual jobs
            ├── database/database.module.ts  # its own DB module (same content as the API one)
            └── lib/config.ts                # BATCH_* job-name constants
```

**Key structural observations**

* `libs/` is *not* a Nest library — it is a plain folder of shared TypeScript inside the API app.
  The batch app reaches into it with the path `apps/<project>-api/src/libs/...`, which is what makes
  the two apps share DTOs, enums and schemas without a publish step.
* `components/` holds **only** feature modules. Infrastructure (database, socket, libs) sits beside
  it, never inside it.
* `like/` and `view/` have **no resolver** — they are pure services consumed by other features.
  Their data reaches the client through `Product`/`Member` fields (`meLiked`) and through
  `getFavorites` / `getVisited` on the product resolver.

---

## 5. Naming Conventions

### Files & folders

| Kind | Convention | Example |
|---|---|---|
| Feature folder | kebab-case, **singular** | `board-article/`, `product/` |
| Module / resolver / service | `<feature>.module.ts`, `<feature>.resolver.ts`, `<feature>.service.ts` | `board-article/board-article.service.ts` |
| GraphQL output type | `libs/dto/<entity>/<entity>.ts` | `libs/dto/product/product.ts` |
| GraphQL create/inquiry inputs | `libs/dto/<entity>/<entity>.input.ts` | `product.input.ts` |
| GraphQL update input | `libs/dto/<entity>/<entity>.update.ts` | `member.update.ts` |
| Enums | `libs/enums/<entity>.enum.ts` (kebab-case) | `board-article.enum.ts` |
| Mongoose schema | `schemas/<Entity>.model.ts` (**PascalCase filename**) | `schemas/Product.model.ts` |
| Guards | `guards/<name>.guard.ts` | `auth.guard.ts` |
| Decorators | `decorators/<camelCaseName>.decorator.ts` | `authMember.decorator.ts` |
| Interceptors | `interceptor/<PascalCase>.interceptor.ts` | `Logging.interceptor.ts` |

### Classes

| Kind | Convention | Example |
|---|---|---|
| Output type (single) | `<Entity>` | `Product` |
| Output type (list wrapper) | `<Entities>` — plural | `Products` |
| Create input | `<Entity>Input` | `ProductInput` |
| Update input | `<Entity>Update` | `ProductUpdate` |
| Public list inquiry | `<Entities>Inquiry` | `ProductsInquiry` |
| Owner list inquiry | `<Owner><Entities>Inquiry` | `SellerProductsInquiry` |
| Admin list inquiry | `All<Entities>Inquiry` | `AllProductsInquiry` |
| Simple paginated inquiry | `OrdinaryInquiry` (`page`, `limit` only) | reused by favorites/visited |
| Nested search class | initials of the inquiry + `Search`, **not exported** | `PISearch` inside `ProductsInquiry` |
| Stats mutator | `<entity>StatsEditor` | `productStatsEditor` |

### GraphQL operation names — the endpoint naming grammar

| Operation | Name | Guard |
|---|---|---|
| Create | `create<Entity>` | `RolesGuard` (SELLER) or `AuthGuard` |
| Read one | `get<Entity>` | `WithoutGuard` |
| Read list (public) | `get<Entities>` | `WithoutGuard` |
| Update own | `update<Entity>` | `AuthGuard` / `RolesGuard` |
| Owner's own list | `get<Owner><Entities>` | `RolesGuard` |
| Toggle like | `likeTarget<Entity>` | `AuthGuard` |
| Favorites (liked list) | `getFavorites` | `AuthGuard` |
| History (viewed list) | `getVisited` | `AuthGuard` |
| Follow / unfollow | `subscribe` / `unsubscribe` | `AuthGuard` |
| Follow lists | `getMemberFollowings` / `getMemberFollowers` | `WithoutGuard` |
| Auth | `signup`, `login`, `checkAuth`, `checkAuthRoles` | — / `AuthGuard` / `RolesGuard` |
| Upload | `imageUploader`, `imagesUploader` | `AuthGuard` |
| Admin list | `getAll<Entities>ByAdmin` | `RolesGuard(ADMIN)` |
| Admin update | `update<Entity>ByAdmin` | `RolesGuard(ADMIN)` |
| Admin hard delete | `remove<Entity>ByAdmin` | `RolesGuard(ADMIN)` |

Admin operations are grouped at the **bottom** of the resolver file under a `/** ADMIN **/` banner.

---

## 6. Bootstrap Layer

### `src/main.ts`

Order matters: pipes → interceptors → CORS → upload middleware → static → ws adapter → listen.

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './libs/interceptor/Logging.interceptor';
import { graphqlUploadExpress } from 'graphql-upload';
import * as express from 'express';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.enableCors({ origin: true, credentials: true });

  app.use(graphqlUploadExpress({ maxFileSize: 15000000, maxFiles: 10 }));
  app.use('/uploads', express.static('./uploads'));

  app.useWebSocketAdapter(new WsAdapter(app));
  await app.listen(process.env.PORT_API ?? 3000);
}
bootstrap();
```

### `src/app.module.ts`

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      playground: true,
      //@ts-ignore
      uploads: false,          // REQUIRED: disable Apollo's built-in uploads so that
                               // the graphql-upload middleware handles them instead
      autoSchemaFile: true,    // code-first; schema generated in memory
      formatError: (error: T) => {
        const graphQLFormattedError = {
          code: error?.extensions.code,
          message:
            error?.extensions?.exception?.response?.message ||
            error?.extensions?.response?.message ||
            error?.message,
        };
        console.log('GRAPHQL GLOBAL ERROR:', graphQLFormattedError);
        return graphQLFormattedError;
      },
    }),
    ComponentsModule,
    DatabaseModule,
    SocketModule,
  ],
  controllers: [AppController],
  providers: [AppService, AppResolver],
})
export class AppModule {}
```

`formatError` is the **single place** where exceptions become client-visible messages, which is why
services may throw freely with `Message.*` constants.

### `src/database/database.module.ts`

Async factory, env-driven DB selection, connection-state log in the constructor. Exports
`MongooseModule` so feature modules can call `forFeature`.

```ts
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.NODE_ENV === 'production' ? process.env.MONGO_PROD : process.env.MONGO_DEV,
      }),
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {
  constructor(@InjectConnection() private readonly connection: Connection) {
    if (connection.readyState === 1) {
      console.log(`MongoDB is connected into ${process.env.NODE_ENV === 'production' ? 'production' : 'development'} DB`);
    } else {
      console.log('DB is not connected!');
    }
  }
}
```

### `src/components/components.module.ts`

Pure aggregator — no providers, no controllers, no exports.

```ts
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
  ],
})
export class ComponentsModule {}
```

### `app.controller.ts` / `app.service.ts` / `app.resolver.ts`

Deliberately trivial — a REST `GET /` health string and a `sayHello` GraphQL query. They exist so the
server can be smoke-tested without touching the domain.

---

## 7. Shared Libs Layer

### `libs/types/common.ts` — create this first

```ts
import { ObjectId } from 'mongoose';

/** Loose map used for dynamic Mongo `match` / `sort` objects and JWT payloads. */
export interface T {
  [key: string]: any;
}

/** Used by every `<entity>StatsEditor` to $inc a denormalized counter. */
export interface StatisticModifier {
  _id: ObjectId;
  targetKey: string;
  modifier: number;
}
```

`T` is used everywhere a dynamically-shaped object is built (`match`, `sort`, `search`, JWT payload).
It is the codebase's deliberate escape hatch from strict typing at the Mongo boundary.

### `libs/enums/common.enum.ts`

Two things live here and nothing else — the **Message catalogue** (every user-facing string in the
app) and **Direction**.

```ts
export enum Message {
  SOMETHING_WENT_WRONG = 'Something went wrong!',
  NO_DATA_FOUND = 'No data found!',
  CREATE_FAILED = 'Create failed!',
  UPDATE_FAILED = 'Update failed!',
  REMOVE_FAILED = 'Remove failed!',
  UPLOAD_FAILED = 'Upload failed!',
  BAD_REQUEST = 'Bad Request',

  USED_MEMBER_NICK_OR_PHONE = 'Already used member nick or phone',
  NO_MEMBER_NICK = 'No member with that nickname!',
  WRONG_PASSWORD = 'Wrong password, try again!',
  NOT_AUTHENTICATED = 'You are not authenticated, please login first!',
  BLOCKED_USER = 'You have been blocked!',
  TOKEN_NOT_EXIST = 'Bearer Token is not provided!',
  ONLY_SPECIFIC_ROLES_ALLOWED = 'Allowed only for members with specific roles!',
  NOT_ALLOWED_REQUEST = 'Not Allowed Request!',
  PROVIDE_ALLOWED_FORMAT = 'Please provide jpg, png, or jpeg images!',
  SELF_SUBSCRIPTION_DENIED = 'Self subscription is denied!',

  // e-commerce additions
  OUT_OF_STOCK = 'Product is out of stock!',
  NOT_ENOUGH_STOCK = 'Requested quantity exceeds available stock!',
  EMPTY_CART = 'Your cart is empty!',
  ORDER_NOT_CANCELLABLE = 'This order can no longer be cancelled!',
}

export enum Direction {
  ASC = 1,
  DESC = -1,
}
registerEnumType(Direction, { name: 'Direction' });
```

> `Message` is **not** registered with GraphQL — it is a server-side constant catalogue.
> `Direction` **is** registered, because clients send it.

### Every other enum file

One file per entity; each enum registered immediately, with `name` equal to the identifier:

```ts
import { registerEnumType } from '@nestjs/graphql';

export enum MemberType { USER = 'USER', SELLER = 'SELLER', ADMIN = 'ADMIN' }
registerEnumType(MemberType, { name: 'MemberType' });

export enum MemberStatus { ACTIVE = 'ACTIVE', BLOCK = 'BLOCK', DELETE = 'DELETE' }
registerEnumType(MemberStatus, { name: 'MemberStatus' });

export enum MemberAuthType { PHONE = 'PHONE', EMAIL = 'EMAIL', TELEGRAM = 'TELEGRAM' }
registerEnumType(MemberAuthType, { name: 'MemberAuthType' });
```

Standard enum sets to reproduce:

* `<Actor>Type` — role enum, **must include `ADMIN`**.
* `<Actor>Status` — `ACTIVE | BLOCK | DELETE`.
* `<Actor>AuthType` — `PHONE | EMAIL | TELEGRAM`.
* `<Resource>Status` — `ACTIVE | <TERMINAL> | DELETE` (reference uses `SOLD`; use `SOLD_OUT`).
* `<Resource>Category`, `<Resource>Type` and any other faceted-search dimension.
* `ViewGroup`, `LikeGroup`, `CommentGroup`, `NotificationGroup` — **all share the same member set**,
  one member per viewable entity: `MEMBER | ARTICLE | PROPERTY` → `MEMBER | ARTICLE | PRODUCT`.

### `libs/config.ts` — four responsibilities

```ts
import { ObjectId } from 'bson';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { T } from './types/common';

/* ------------------------------------------------------------------ */
/* 1. SORT WHITELISTS — referenced by @IsIn() in every Inquiry DTO      */
/* ------------------------------------------------------------------ */
export const availableMemberSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews'];
export const availableSellerSorts = ['createdAt', 'updatedAt', 'memberLikes', 'memberViews', 'memberRank'];
export const availableProductSorts = ['createdAt', 'updatedAt', 'productLikes', 'productViews', 'productRank', 'productPrice'];
export const availableBoardArticleSorts = ['createdAt', 'updatedAt', 'articleLikes', 'articleViews'];
export const availableCommentSorts = ['createdAt', 'updatedAt'];
export const availableOptions = ['productOnSale', 'productFreeShipping'];   // boolean facets

/* ------------------------------------------------------------------ */
/* 2. IMAGE CONFIGURATION                                              */
/* ------------------------------------------------------------------ */
export const validMimeTypes = ['image/png', 'image/jpg', 'image/jpeg'];
export const validImageExtensions = ['.png', '.jpg', '.jpeg'];

export const isValidImage = (filename: string, mimetype?: string): boolean => {
  // Some clients (Postman, Altair, curl) send "application/octet-stream" or an empty
  // content-type for the file part, so fall back to the file extension.
  const mime = (mimetype ?? '').split(';')[0].trim().toLowerCase();
  if (validMimeTypes.includes(mime)) return true;
  const ext = path.parse(filename ?? '').ext.toLowerCase();
  return validImageExtensions.includes(ext);
};

export const getSerialForImage = (filename: string) => uuidv4() + path.parse(filename).ext;

/* ------------------------------------------------------------------ */
/* 3. MONGO HELPER — string id from GraphQL -> real ObjectId           */
/* ------------------------------------------------------------------ */
export const shapeIntoMongoObjectId = (target: any) =>
  typeof target === 'string' ? new ObjectId(target) : target;

/* ------------------------------------------------------------------ */
/* 4. REUSABLE $lookup FRAGMENTS — see §14                             */
/* ------------------------------------------------------------------ */
export const lookupMember = {
  $lookup: { from: 'members', localField: 'memberId', foreignField: '_id', as: 'memberData' },
};

export const lookupAuthMemberLiked = (memberId: T, targetRefId: string = '$_id') => ({
  $lookup: {
    from: 'likes',
    let: { localLikeRefId: targetRefId, localMemberId: memberId, localMyFavorite: true },
    pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ['$likeRefId', '$$localLikeRefId'] },
        { $eq: ['$memberId', '$$localMemberId'] },
      ] } } },
      { $project: { _id: 0, memberId: 1, likeRefId: 1, myFavorite: '$$localMyFavorite' } },
    ],
    as: 'meLiked',
  },
});

interface LookupAuthMemberFollowed { followerId: T; followingId: string; }
export const lookupAuthMemberFollowed = ({ followerId, followingId }: LookupAuthMemberFollowed) => ({
  $lookup: {
    from: 'follows',
    let: { localFollowerId: followerId, localFollowingId: followingId, localMyFavorite: true },
    pipeline: [
      { $match: { $expr: { $and: [
        { $eq: ['$followerId', '$$localFollowerId'] },
        { $eq: ['$followingId', '$$localFollowingId'] },
      ] } } },
      { $project: { _id: 0, followerId: 1, followingId: 1, myFavorite: '$$localMyFavorite' } },
    ],
    as: 'meFollowed',
  },
});

export const lookupFollowingData = { $lookup: { from: 'members', localField: 'followingId', foreignField: '_id', as: 'followingData' } };
export const lookupFollowerData  = { $lookup: { from: 'members', localField: 'followerId',  foreignField: '_id', as: 'followerData'  } };
export const lookupFavorite      = { $lookup: { from: 'members', localField: 'favoriteProduct.memberId', foreignField: '_id', as: 'favoriteProduct.memberData' } };
export const lookupVisit         = { $lookup: { from: 'members', localField: 'visitedProduct.memberId',  foreignField: '_id', as: 'visitedProduct.memberData'  } };
```

Putting the `$lookup` fragments in `config.ts` is what keeps the services readable: an aggregation
reads as a list of named steps rather than 40 lines of pipeline JSON.

### `libs/interceptor/Logging.interceptor.ts`

Global interceptor registered in `main.ts`. Logs the request body, then the response with elapsed
milliseconds, each truncated to 75 chars so the terminal stays readable.

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Logger = new Logger();

  public intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const recordTime = Date.now();
    const requestType = context.getType<GqlContextType>();

    if (requestType === 'http') {
      // develop if needed
    } else if (requestType === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      this.logger.log(`${this.stringify(gqlContext.getContext().req.body)}`, 'REQUEST');

      return next.handle().pipe(
        tap((context) => {
          const responseTime = Date.now() - recordTime;
          this.logger.log(`${this.stringify(context)}-${responseTime}ms \n\n`, 'RESPONSE');
        }),
      );
    }
    return next.handle();
  }

  private stringify(context: ExecutionContext): string {
    return JSON.stringify(context).slice(0, 75);
  }
}
```

Errors are **not** handled here — they are formatted globally by `formatError` in `AppModule`.

---

## 8. Schema Layer

Location: `src/schemas/<Entity>.model.ts`.

**Rules**

1. Plain `new Schema({...})` — **no** `@Schema()` / `@Prop()` decorators.
2. `export default <Entity>Schema;` — default export, imported without braces.
3. Always `{ timestamps: true, collection: '<pluralCamelCase>' }`.
4. Status/type fields: `{ type: String, enum: SomeEnum, default: SomeEnum.ACTIVE }` or `required: true`.
5. Every counter: `{ type: Number, default: 0 }` — counters are denormalized on the parent document
   and maintained by `<entity>StatsEditor` in the service.
6. Foreign keys: `{ type: Schema.Types.ObjectId, required: true, ref: '<Entity>' }`.
7. Secrets: `memberPassword: { type: String, select: false, required: true }` — never returned unless
   explicitly `.select('+memberPassword')`.
8. Uniqueness: inline `index: { unique: true, sparse: true }` for single fields; a compound
   `Schema.index({...}, { unique: true })` after the definition for join collections and for
   duplicate-listing prevention.
9. Soft delete: `deletedAt: { type: Date }` plus a `DELETE` member in the status enum.

**Actor schema (Member)**

```ts
const MemberSchema = new Schema({
  memberType:     { type: String, enum: MemberType,     default: MemberType.USER },
  memberStatus:   { type: String, enum: MemberStatus,   default: MemberStatus.ACTIVE },
  memberAuthType: { type: String, enum: MemberAuthType, default: MemberAuthType.PHONE },
  memberPhone:    { type: String, index: { unique: true, sparse: true }, required: true },
  memberNick:     { type: String, index: { unique: true, sparse: true }, required: true },
  memberPassword: { type: String, select: false, required: true },
  memberFullName: { type: String },
  memberImage:    { type: String, default: '' },
  memberAddress:  { type: String },
  memberDesc:     { type: String },

  // denormalized counters — one per relationship the UI must display
  memberProducts:   { type: Number, default: 0 },
  memberArticles:   { type: Number, default: 0 },
  memberFollowers:  { type: Number, default: 0 },
  memberFollowings: { type: Number, default: 0 },
  memberPoints:     { type: Number, default: 0 },
  memberLikes:      { type: Number, default: 0 },
  memberViews:      { type: Number, default: 0 },
  memberComments:   { type: Number, default: 0 },
  memberRank:       { type: Number, default: 0 },
  memberWarnings:   { type: Number, default: 0 },
  memberBlocks:     { type: Number, default: 0 },

  deletedAt: { type: Date },
}, { timestamps: true, collection: 'members' });

export default MemberSchema;
```

**Primary-resource schema (Product)**

```ts
const ProductSchema = new Schema({
  productCategory: { type: String, enum: ProductCategory, required: true },
  productStatus:   { type: String, enum: ProductStatus, default: ProductStatus.ACTIVE },
  productGender:   { type: String, enum: ProductGender, required: true },
  productBrand:    { type: String, required: true },
  productTitle:    { type: String, required: true },
  productPrice:    { type: Number, required: true },
  productDiscount: { type: Number, default: 0 },
  productStock:    { type: Number, required: true },
  productSizes:    { type: [String], enum: ProductSize, required: true },
  productColors:   { type: [String], enum: ProductColor, required: true },
  productImages:   { type: [String], required: true },
  productDesc:     { type: String },

  productViews:    { type: Number, default: 0 },
  productLikes:    { type: Number, default: 0 },
  productComments: { type: Number, default: 0 },
  productRank:     { type: Number, default: 0 },

  memberId:  { type: Schema.Types.ObjectId, required: true, ref: 'Member' },   // the seller
  soldOutAt: { type: Date },
  deletedAt: { type: Date },
}, { timestamps: true, collection: 'products' });

ProductSchema.index(
  { productCategory: 1, productBrand: 1, productTitle: 1, productPrice: 1 },
  { unique: true },
);

export default ProductSchema;
```

**Engagement schema (View — Like is identical with `like*` names)**

```ts
const ViewSchema = new Schema({
  viewGroup: { type: String, enum: ViewGroup, required: true },
  viewRefId: { type: Schema.Types.ObjectId, required: true },
  memberId:  { type: Schema.Types.ObjectId, required: true, ref: 'Member' },
}, { timestamps: true, collection: 'views' });

ViewSchema.index({ memberId: 1, viewRefId: 1 }, { unique: true });
export default ViewSchema;
```

`Follow` uses `{ followingId, followerId }` with a compound unique index.
`Notification` carries `authorId` + `receiverId` + optional `productId` / `articleId`.

---

## 9. DTO Layer

Location: `src/libs/dto/<entity>/`. This is the GraphQL contract. **Three files per entity, never more.**

### 9.1 `<entity>.ts` — `@ObjectType()` outputs

* Mirrors the Mongoose schema field for field.
* `_id` is always `@Field(() => String) _id: ObjectId | undefined;`
* Enum fields use the enum as the GraphQL type: `@Field(() => MemberType)`.
* Counters use `@Field(() => Int)`; money/measures use `@Field(() => Number)`.
* Optional fields: `@Field(() => String, { nullable: true }) foo?: string;`
* Secrets get **no** `@Field` at all — declared as a bare TS property so the service can read them
  but GraphQL can never expose them (`memberPassword?: string;`).
* `accessToken?: string` lives on the actor output type, nullable, populated at signup/login/update.
* Fields produced by aggregation go at the bottom under a `/** from aggregation **/` banner:
  `memberData`, `meLiked`, `meFollowed`.

```ts
@ObjectType()
export class Member {
  @Field(() => String) _id: ObjectId | undefined;
  @Field(() => MemberType) memberType: MemberType | undefined;
  @Field(() => MemberStatus) memberStatus: MemberStatus | undefined;
  @Field(() => String) memberPhone: string | undefined;
  @Field(() => String) memberNick: string | undefined;

  memberPassword?: string;                        // no @Field — never exposed

  @Field(() => String, { nullable: true }) memberFullName?: string;
  @Field(() => String) memberImage?: string;
  @Field(() => Int) memberProducts: number;
  @Field(() => Int) memberLikes: number;
  @Field(() => Int) memberViews: number;
  @Field(() => Date, { nullable: true }) deletedAt?: Date;
  @Field(() => Date) createdAt: Date;
  @Field(() => Date) updatedAt: Date;
  @Field(() => String, { nullable: true }) accessToken?: string;

  /** from aggregation **/
  @Field(() => [MeLiked],   { nullable: true }) meLiked?: MeLiked[];
  @Field(() => [MeFollowed],{ nullable: true }) meFollowed?: MeFollowed[];
}
```

**The pagination pair — declared once in `member.ts`, imported everywhere else.**

```ts
@ObjectType()
export class TotalCounter {
  @Field(() => Int, { nullable: true }) total: number;
}

@ObjectType()
export class Members {                          // plural class name = the list wrapper
  @Field(() => [Member]) list: Member[];
  @Field(() => [TotalCounter], { nullable: true }) metaCounter: TotalCounter[];
}
```

> `TotalCounter` is defined **once** (in `member.ts`) and imported by `product.ts`,
> `board-article.ts`, `comment.ts`, `follow.ts`. Do not redeclare it — `autoSchemaFile` would
> collide on the type name.
>
> The `{ list, metaCounter }` shape is produced directly by the `$facet` stage in §14 — every list
> query in the app returns it.

### 9.2 `<entity>.input.ts` — creation + inquiry inputs

Contents, in this order:

1. `<Entity>Input` — the create payload.
2. `LoginInput` (actor only).
3. Range helper input types where needed (`PricesRange`, `PeriodsRange`, `SquaresRange`).
4. A **non-exported** nested search class per inquiry, named with the inquiry's initials + `Search`
   (`PISearch` for `ProductsInquiry`, `MISearch` for `MembersInquiry`, `ALPISearch` for
   `AllProductsInquiry`). It is `@InputType()` but **not exported** — it exists only as the `search`
   field of its inquiry.
5. `<Plural>Inquiry` — the paginated list request.
6. `OrdinaryInquiry` — `{ page, limit }` only, reused by favorites/visited.

**Validation is stacked above `@Field`, in this order:** `@IsNotEmpty()` / `@IsOptional()`, then
shape validators (`@IsInt`, `@Length`, `@Min`, `@IsIn`), then `@Field(...)`.

```ts
@InputType()
export class MemberInput {
  @IsNotEmpty() @Length(3, 12) @Field(() => String) memberNick: string;
  @IsNotEmpty() @Length(5, 12) @Field(() => String) memberPassword: string;
  @IsNotEmpty()                @Field(() => String) memberPhone: string;
  @IsOptional() @Field(() => MemberType,     { nullable: true }) memberType?: MemberType;
  @IsOptional() @Field(() => MemberAuthType, { nullable: true }) memberAuthType?: MemberAuthType;
}

@InputType()
export class LoginInput {
  @IsNotEmpty() @Length(3, 12) @Field(() => String) memberNick: string;
  @IsNotEmpty() @Length(5, 12) @Field(() => String) memberPassword: string;
}

@InputType()
class PISearch {                                   // not exported on purpose
  @IsOptional() @Field(() => String, { nullable: true })
  //@ts-ignore
  memberId?: ObjectId;
  @IsOptional() @Field(() => [ProductCategory], { nullable: true }) categoryList?: ProductCategory[];
  @IsOptional() @Field(() => [ProductSize],     { nullable: true }) sizeList?: ProductSize[];
  @IsOptional() @Field(() => [ProductColor],    { nullable: true }) colorList?: ProductColor[];
  @IsOptional() @IsIn(availableOptions, { each: true })
                @Field(() => [String], { nullable: true }) options?: string[];
  @IsOptional() @Field(() => PricesRange,  { nullable: true }) pricesRange?: PricesRange;
  @IsOptional() @Field(() => PeriodsRange, { nullable: true }) periodsRange?: PeriodsRange;
  @IsOptional() @Field(() => String, { nullable: true }) text?: string;
}

@InputType()
export class ProductsInquiry {
  @IsNotEmpty() @Min(1) @Field(() => Int) page: number;
  @IsNotEmpty() @Min(1) @Field(() => Int) limit: number;
  @IsOptional() @IsIn(availableProductSorts) @Field(() => String, { nullable: true }) sort?: string;
  @IsOptional() @Field(() => Direction, { nullable: true }) direction?: Direction;
  @IsNotEmpty() @Field(() => PISearch) search: PISearch;
}
```

Foreign keys the **server** fills in (never the client) are declared without `@Field`:

```ts
  //@ts-ignore
  memberId?: ObjectId;        // assigned in the resolver from @AuthMember('_id')
```

### 9.3 `<entity>.update.ts` — `@InputType()` update payload

* `_id` is `@IsNotEmpty() @Field(() => String)` — required.
* Every other field is `@IsOptional()` + `{ nullable: true }`.
* Timestamp fields the server sets (`soldOutAt`, `deletedAt`) are declared **without** `@Field`.

```ts
@InputType()
export class ProductUpdate {
  @IsNotEmpty() @Field(() => String)
  //@ts-ignore
  _id: ObjectId;

  @IsOptional() @Field(() => ProductStatus,   { nullable: true }) productStatus?: ProductStatus;
  @IsOptional() @Field(() => ProductCategory, { nullable: true }) productCategory?: ProductCategory;
  @IsOptional() @Length(3, 100) @Field(() => String, { nullable: true }) productTitle?: string;
  @IsOptional() @Field(() => Number, { nullable: true }) productPrice?: number;
  @IsOptional() @Field(() => [String], { nullable: true }) productImages?: string[];

  soldOutAt?: Date;      // server-set only
  deletedAt?: Date;      // server-set only
}
```

---

## 10. Feature Module Layer

Location: `src/components/<feature>/`. Exactly three files. No repository, no mapper.

### 10.1 `<feature>.module.ts` — the wiring

```ts
@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),  // string token!
    AuthModule,        // because the resolver uses guards
    ViewModule,        // because the service records views
    MemberModule,      // because the service bumps member counters
    LikeModule,        // because the service toggles likes
  ],
  providers: [ProductResolver, ProductService],
  exports: [ProductService],        // export whenever another feature needs this service
})
export class ProductModule {}
```

Rules:

* Model registration always uses a **string name token** (`'Product'`), matched by
  `@InjectModel('Product')` in the service. Never `Product.name`.
* Import `AuthModule` if the resolver uses **any** guard (guards inject `AuthService`).
* Import `ViewModule` if the service records views; `LikeModule` if it toggles likes.
* Cross-feature counter updates: import the owning feature's module and call its **exported service**.
* A module may register a second schema with `forFeature` when it needs read-only access to another
  collection without a service round-trip (e.g. `MemberModule` also registers `Follow` so
  `MemberService.checkSubscription()` can run a single `findOne`).
* Feature modules with no code yet still exist as empty stubs so the aggregator compiles:
  ```ts
  @Module({})
  export class NoticeModule {}
  ```

**Circular-dependency rule.** The dependency graph is kept a DAG by direction:
`Comment → Product → Member`, `Comment → BoardArticle → Member`, `Follow → Member`.
`Member` never imports `Product`. If you genuinely need a cycle, use
`forwardRef(() => XModule)` on both sides — but restructure first.

### 10.2 `<feature>.resolver.ts` — thin

Responsibilities, and only these:

1. Declare `@Query` / `@Mutation` with an explicit return type.
2. Attach `@Roles(...)` + `@UseGuards(...)`.
3. Pull the caller out with `@AuthMember(...)`.
4. `console.log('Mutation: name')` / `console.log('Query: name')` as the first statement.
5. Convert string ids with `shapeIntoMongoObjectId(...)`.
6. Delegate to the service.

```ts
@Resolver()
export class ProductResolver {
  constructor(private readonly productService: ProductService) {}

  @Roles(MemberType.SELLER)
  @UseGuards(RolesGuard)
  @Mutation(() => Product)
  public async createProduct(
    @Args('input') input: ProductInput,
    @AuthMember('_id') memberId: mongoose.ObjectId,
  ): Promise<Product> {
    console.log('Mutation: createProduct');
    input.memberId = memberId;                        // server-assigned owner
    return this.productService.createProduct(input);
  }

  @UseGuards(WithoutGuard)                            // optional auth
  @Query(() => Product)
  public async getProduct(
    @Args('productId') input: string,
    @AuthMember('_id') memberId: mongoose.ObjectId,
  ): Promise<Product> {
    console.log('Query: getProduct');
    const productId = shapeIntoMongoObjectId(input);
    return this.productService.getProduct(memberId, productId);
  }

  @UseGuards(AuthGuard)                               // must be logged in
  @Mutation(() => Product)
  public async likeTargetProduct(
    @Args('productId') input: string,
    @AuthMember('_id') memberId: mongoose.ObjectId,
  ): Promise<Product> {
    console.log('Mutation: likeTargetProduct');
    const likeRefId = shapeIntoMongoObjectId(input);
    return await this.productService.likeTargetProduct(memberId, likeRefId);
  }

  /** ADMIN **/
  @Roles(MemberType.ADMIN)
  @UseGuards(RolesGuard)
  @Query(() => Products)
  public async getAllProductsByAdmin(@Args('input') input: AllProductsInquiry): Promise<Products> {
    console.log('Query: getAllProductsByAdmin');
    return await this.productService.getAllProductsByAdmin(input);
  }
}
```

**Argument conventions**

* A single id argument is a **named scalar** matching the entity: `@Args('productId') input: string`.
  It arrives as a string and is converted in the resolver.
* Everything else is a single `@Args('input')` object.
* `@AuthMember('_id')` yields the caller's id; `@AuthMember()` with no argument yields the whole
  decoded JWT payload (used by `checkAuthRoles`).
* On self-update, the resolver deletes the client-supplied `_id` so a caller can never update another
  document: `delete input._id;` then pass `memberId` separately.

### 10.3 `<feature>.service.ts` — all business logic

Constructor injects its own model plus the sibling services it needs:

```ts
@Injectable()
export class ProductService {
  constructor(
    @InjectModel('Product') private readonly productModel: Model<Product>,
    private memberService: MemberService,
    private viewService: ViewService,
    private likeService: LikeService,
  ) {}
}
```

**Create — try/catch, translate driver errors, bump the owner's counter**

```ts
public async createProduct(input: ProductInput): Promise<Product> {
  try {
    const result = await this.productModel.create(input);
    await this.memberService.memberStatsEditor({
      _id: result.memberId, targetKey: 'memberProducts', modifier: 1,
    });
    return result;
  } catch (err) {
    console.log('Error, Service.model', err);
    throw new BadRequestException(Message.CREATE_FAILED);
  }
}
```

**Signup — hash the secret, issue the token, translate the duplicate-key error**

```ts
public async signup(input: MemberInput): Promise<Member> {
  try {
    input.memberPassword = await this.authService.hashPassword(input.memberPassword);
    const result = await this.memberModel.create(input);
    result.accessToken = await this.authService.createToken(result);
    return result;
  } catch (err) {
    console.log('Error, Service.model', err);
    throw new BadRequestException(Message.USED_MEMBER_NICK_OR_PHONE);
  }
}
```

**Login — explicit `.select('+memberPassword')`, status checks *before* the password check**

```ts
public async login(input: LoginInput): Promise<Member> {
  const { memberNick, memberPassword } = input;
  const response: Member | null = await this.memberModel
    .findOne({ memberNick })
    .select('+memberPassword')
    .exec();

  if (!response || response.memberStatus === MemberStatus.DELETE)
    throw new InternalServerErrorException(Message.NO_MEMBER_NICK);
  if (response.memberStatus === MemberStatus.BLOCK)
    throw new InternalServerErrorException(Message.BLOCKED_USER);

  const isMatch = await this.authService.comparePasswords(memberPassword, response.memberPassword);
  if (!isMatch) throw new InternalServerErrorException(Message.WRONG_PASSWORD);

  response.accessToken = await this.authService.createToken(response);
  return response;
}
```

**Update — scoped by owner + status, stamp terminal timestamps, re-issue token, adjust counters**

```ts
public async updateProduct(memberId: ObjectId, input: ProductUpdate): Promise<Product> {
  let { productStatus, soldOutAt, deletedAt } = input;
  const search: T = { _id: input._id, memberId: memberId, productStatus: ProductStatus.ACTIVE };

  if (productStatus === ProductStatus.SOLD_OUT) soldOutAt = moment().toDate();
  else if (productStatus === ProductStatus.DELETE) deletedAt = moment().toDate();

  const result = await this.productModel.findOneAndUpdate(search, input, { new: true }).exec();
  if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

  if (soldOutAt || deletedAt) {
    await this.memberService.memberStatsEditor({
      _id: memberId, targetKey: 'memberProducts', modifier: -1,
    });
  }
  return result;
}
```

The `search` object doing double duty as an authorization filter (`memberId: memberId`) is the
codebase's ownership check — there is no separate policy layer.

**Read one — record a view, increment the counter, attach `meLiked` and the owner**

```ts
public async getProduct(memberId: ObjectId, productId: ObjectId): Promise<Product> {
  const search: T = { _id: productId, productStatus: ProductStatus.ACTIVE };
  const targetProduct: Product = await this.productModel.findOne(search).lean().exec();
  if (!targetProduct) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

  if (memberId) {                                    // only for logged-in viewers
    const viewInput = { memberId, viewRefId: productId, viewGroup: ViewGroup.PRODUCT };
    const newView = await this.viewService.recordView(viewInput);
    if (newView) {
      await this.productStatsEditor({ _id: productId, targetKey: 'productViews', modifier: 1 });
      targetProduct.productViews++;                  // keep the returned doc in sync
    }
    const likeInput = { memberId, likeRefId: productId, likeGroup: LikeGroup.PRODUCT };
    targetProduct.meLiked = await this.likeService.checkLikeExistance(likeInput);
  }

  targetProduct.memberData = await this.memberService.getMember(null, targetProduct.memberId);
  return targetProduct;
}
```

Note `.lean()` — needed so plain-object mutation (`productViews++`, `meLiked = ...`) works, and
`getMember(null, ...)` — passing `null` as the viewer so fetching the owner does **not** record a
view on the owner.

**List — the canonical `$match → $sort → $facet` aggregation (see §14).**

---

## 11. Auth Subsystem — Three Guards

`components/auth/` contains no resolver. It exposes `AuthService`, two decorators and three guards.

### `auth.module.ts`

```ts
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('SECRET_TOKEN');
        if (!secret) throw new Error('SECRET_TOKEN is not configured');
        return { secret, signOptions: { expiresIn: '30d' } };
      },
    }),
  ],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
```

### `auth.service.ts` — four methods, nothing else

```ts
@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  public async hashPassword(memberPassword: string): Promise<string> {
    const salt = await bcrypt.genSalt();
    return await bcrypt.hash(memberPassword, salt);
  }

  public async comparePasswords(password: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }

  /** The whole member document becomes the JWT payload, minus the password. */
  public async createToken(member: Member): Promise<string> {
    const payload: T = {};
    Object.keys(member['_doc'] ? member['_doc'] : member).map((ele) => {
      payload[`${ele}`] = member[`${ele}`];
    });
    delete payload.memberPassword;
    return await this.jwtService.signAsync(payload);
  }

  public async verifyToken(token: string): Promise<Member> {
    const member = await this.jwtService.verifyAsync(token);
    member._id = shapeIntoMongoObjectId(member._id);      // string -> ObjectId on the way back in
    return member;
  }
}
```

**Design consequence:** because the entire member document is the JWT payload, `@AuthMember()`
returns a full `Member` without a DB hit — guards never query the database. The trade-off is that a
token goes stale after a profile change, which is why every mutation that changes the member
re-issues `accessToken`.

### The decorators

```ts
// authMember.decorator.ts — reads the member the guard placed on request.body
export const AuthMember = createParamDecorator((data: string, context: ExecutionContext | any) => {
  let request: any;
  if (context.contextType === 'graphql') {
    request = context.getArgByIndex(2).req;
    if (request.body.authMember) {
      request.body.authMember.authorization = request.headers?.authorization;
    }
  } else request = context.switchToHttp().getRequest();

  const member = request.body.authMember;
  if (member) return data ? member?.[data] : member;
  else return null;
});

// roles.decorator.ts
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);
```

### The three guards — pick one per endpoint

| Guard | Token required? | Behaviour | Use for |
|---|---|---|---|
| `AuthGuard` | **Yes** | Throws `TOKEN_NOT_EXIST` / `NOT_AUTHENTICATED`; sets `request.body.authMember` | Any endpoint the caller must be logged in for |
| `RolesGuard` | **Yes** | Everything `AuthGuard` does, plus `roles.includes(authMember.memberType)`; throws `ONLY_SPECIFIC_ROLES_ALLOWED` | Seller-only and admin-only endpoints; always paired with `@Roles(...)` |
| `WithoutGuard` | No | If a token is present, decodes it and sets `authMember`; otherwise sets `null`. **Never throws.** | Public reads that behave differently for logged-in users (view recording, `meLiked`) |

All three follow the same shape: they only act when `context.contextType === 'graphql'`, they read
the bearer token from `context.getArgByIndex(2).req.headers.authorization`, and they hand the decoded
member to the resolver by writing `request.body.authMember`. That single convention is what makes
`@AuthMember()` work identically under all three.

`@Roles(...)` must be listed **above** `@UseGuards(RolesGuard)`; the guard reads the metadata with
`this.reflector.get<string[]>('roles', context.getHandler())` and returns `true` immediately when no
roles metadata is present.

---

## 12. Engagement Subsystem — The Reusable Endpoints

These four features are domain-independent. Copy them into the e-commerce project essentially
unchanged; only the `*Group` enum members change (`PROPERTY` → `PRODUCT`).

### View — "record once, count once"

`ViewModule` exports `ViewService`; there is **no** view resolver.

```ts
public async recordView(input: ViewInput): Promise<View | null> {
  const viewExist = await this.checkViewExistance(input);
  if (!viewExist) return await this.viewModel.create(input);   // first visit -> new doc
  else return null;                                            // repeat visit -> nothing
}
```

The caller increments its own counter **only when `recordView` returns non-null**. That is the whole
"unique view" mechanic: uniqueness is enforced by the compound index `{ memberId, viewRefId }`, and
the counter can never drift.

`getVisitedProducts(memberId, { page, limit })` is the browsing-history endpoint — it aggregates the
`views` collection, `$lookup`s the products, and remaps `data[0].list.map(e => e.visitedProduct)` so
the client receives a normal `Products` payload.

### Like — "toggle returns a modifier"

```ts
public async toggleLike(input: LikeInput): Promise<number> {
  const search: T = { memberId: input.memberId, likeRefId: input.likeRefId };
  const exist = await this.likeModel.findOne(search).exec();
  let modifier = 1;

  if (exist) {
    await this.likeModel.findOneAndDelete(search).exec();
    modifier = -1;
  } else {
    try {
      await this.likeModel.create(input);
    } catch (err) {
      throw new BadRequestException(Message.CREATE_FAILED);
    }
  }
  return modifier;                                   // +1 liked, -1 unliked
}
```

The caller feeds that `modifier` straight into its `<entity>StatsEditor`, so one method serves like
and unlike:

```ts
public async likeTargetProduct(memberId: ObjectId, likeRefId: ObjectId): Promise<Product> {
  const target = await this.productModel.findOne({ _id: likeRefId, productStatus: ProductStatus.ACTIVE }).exec();
  if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

  const modifier: number = await this.likeService.toggleLike({
    memberId, likeRefId, likeGroup: LikeGroup.PRODUCT,
  });
  const result = await this.productStatsEditor({ _id: likeRefId, targetKey: 'productLikes', modifier });
  if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
  return result;
}
```

`checkLikeExistance()` returns `MeLiked[]` — an array of zero or one element — because the same shape
comes out of the `lookupAuthMemberLiked` `$lookup` in list queries. Single-read and list paths
therefore produce **identical JSON**, and the frontend has one code path.

`getFavoriteProducts(memberId, { page, limit })` is the wishlist endpoint, built exactly like
`getVisitedProducts` but over the `likes` collection.

### Follow — "two counters, one write"

```ts
public async subscribe(followerId: ObjectId, followingId: ObjectId): Promise<Follower> {
  if (followerId.toString() === followingId.toString())
    throw new InternalServerErrorException(Message.SELF_SUBSCRIPTION_DENIED);

  const targetMember = await this.memberService.getMember(null, followingId);
  if (!targetMember) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

  const result = await this.registerSubscription(followerId, followingId);

  await this.memberService.memberStatsEditor({ _id: followerId,  targetKey: 'memberFollowings', modifier: 1 });
  await this.memberService.memberStatsEditor({ _id: followingId, targetKey: 'memberFollowers',  modifier: 1 });
  return result;
}
```

`unsubscribe` is the mirror image with `modifier: -1` and `findOneAndDelete`.
`getMemberFollowings` / `getMemberFollowers` are `$facet` lists enriched with **three** lookups:
`lookupAuthMemberLiked`, `lookupAuthMemberFollowed`, and `lookupFollowingData` / `lookupFollowerData`.

For e-commerce this becomes **follow a seller / follow a brand** — no code change.

### Comment — one collection, three parents

`Comment` is polymorphic through `commentGroup` + `commentRefId`. `createComment` switches on the
group to bump the right parent counter:

```ts
switch (input.commentGroup) {
  case CommentGroup.PRODUCT:
    await this.productService.productStatsEditor({ _id: input.commentRefId, targetKey: 'productComments', modifier: 1 });
    break;
  case CommentGroup.ARTICLE:
    await this.boardArticleService.boardArticleStatsEditor({ _id: input.commentRefId, targetKey: 'articleComments', modifier: 1 });
    break;
  case CommentGroup.MEMBER:
    await this.memberService.memberStatsEditor({ _id: input.commentRefId, targetKey: 'memberComments', modifier: 1 });
    break;
}
```

This is why `CommentModule` imports `ProductModule`, `BoardArticleModule` and `MemberModule` — it is
the one feature that legitimately depends on three others. Adding a new commentable entity means:
add the enum member, add a `case`, done.

**For the clothing shop this is your product-review system.** Add `commentRating: number` (1–5) to
the schema/DTOs and a `productRating` average on `Product`, maintained the same way as the counters.

### Notice & Notification

Schemas exist in the reference but the features are unimplemented — they are the intended extension
points. `Notification` already carries `notificationType` (`LIKE | COMMENT`), `notificationStatus`
(`WAIT | READ`), `notificationGroup`, `authorId`, `receiverId`, plus the optional entity ids. Wire it
into `toggleLike` / `createComment` / order status changes, and push through the WebSocket gateway
(§18).

---

## 13. Module Interaction Map — who imports who

```
                         AppModule
             ┌───────────────┼───────────────┬──────────────┐
             │               │               │              │
      ComponentsModule  DatabaseModule  SocketModule   GraphQLModule
             │
   ┌─────────┼─────────┬──────────┬──────────┬─────────┬──────────┐
   │         │         │          │          │         │          │
 Member   Product  BoardArticle Comment   Follow     Like       View
   │         │         │          │          │         │          │
   └─ imports Auth, View, Like, (Follow schema)        (no resolver — service only)
             └─ imports Auth, View, Member, Like
                       └─ imports Auth, View, Member, Like
                                  └─ imports Auth, Member, Product, BoardArticle
                                             └─ imports Auth, Member
```

**Service-call edges (runtime dependencies)**

| Caller | Callee | Why |
|---|---|---|
| `MemberService` | `AuthService` | hash/compare passwords, create token |
| `MemberService` | `ViewService` | record profile views |
| `MemberService` | `LikeService` | `meLiked` on a profile, toggle profile likes |
| `ProductService` | `MemberService` | `memberStatsEditor('memberProducts')`, attach `memberData` |
| `ProductService` | `ViewService` | record product views + `getVisited` |
| `ProductService` | `LikeService` | toggle product likes + `getFavorites` |
| `BoardArticleService` | `MemberService`, `ViewService`, `LikeService` | same three reasons |
| `CommentService` | `MemberService`, `ProductService`, `BoardArticleService` | bump the right parent counter |
| `FollowService` | `MemberService` | verify target exists, bump both follow counters |
| `OrderService` *(new)* | `MemberService`, `ProductService` | decrement stock, bump `memberPoints` |

**The rule this encodes:** a feature owns its collection. Anyone who needs to change that collection
calls the owning service. This is why there are no cross-collection writes anywhere in the codebase.

---

## 14. Canonical Aggregation Patterns

### 14.1 The list query — reuse this shape verbatim for every list endpoint

```ts
public async getProducts(memberId: ObjectId, input: ProductsInquiry): Promise<Products> {
  const match: T = { productStatus: ProductStatus.ACTIVE };
  const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

  this.shapeMatchQuery(match, input);            // faceted search -> mutates `match`
  console.log('match:', match);

  const result = await this.productModel.aggregate([
    { $match: match },
    { $sort: sort },
    {
      $facet: {
        list: [
          { $skip: (input.page - 1) * input.limit },
          { $limit: input.limit },
          lookupAuthMemberLiked(memberId),       // adds meLiked[]
          lookupMember,                          // adds memberData[]
          { $unwind: '$memberData' },            // memberData[] -> memberData
        ],
        metaCounter: [{ $count: 'total' }],
      },
    },
  ]).exec();

  if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);
  return result[0];                              // { list, metaCounter }
}
```

`$facet` runs the page slice and the total count in **one round trip** over the same `$match` result —
that is why the return type is always `{ list, metaCounter }`.

Order inside `list` matters: `$skip`/`$limit` come **first** so the expensive `$lookup`s only run on
the current page.

### 14.2 The faceted-search builder — one private method per resource

Kept out of the query method so the aggregation stays readable:

```ts
private shapeMatchQuery(match: T, input: ProductsInquiry): void {
  const { memberId, categoryList, sizeList, colorList, genderList,
          pricesRange, periodsRange, options, text } = input.search;

  if (memberId)     match.memberId        = shapeIntoMongoObjectId(memberId);
  if (categoryList) match.productCategory = { $in: categoryList };
  if (sizeList)     match.productSizes    = { $in: sizeList };
  if (colorList)    match.productColors   = { $in: colorList };
  if (genderList)   match.productGender   = { $in: genderList };

  if (pricesRange)  match.productPrice = { $gte: pricesRange.start, $lte: pricesRange.end };
  if (periodsRange) match.createdAt    = { $gte: periodsRange.start, $lte: periodsRange.end };
  if (text)         match.productTitle = { $regex: new RegExp(text, 'i') };

  if (options) match['$or'] = options.map((ele) => ({ [ele]: true }));   // boolean facets
}
```

Pattern vocabulary: `$in` for multi-select facets, `$gte/$lte` for ranges, case-insensitive `$regex`
for free text, `$or` over boolean flags for "options" checkboxes.

### 14.3 `meLiked` — per-viewer state inside a list

`lookupAuthMemberLiked(memberId)` performs a correlated sub-pipeline against the `likes` collection
and projects a constant `myFavorite: true`. If the viewer has liked the row, `meLiked` is a one-element
array; otherwise it is empty. Anonymous viewers (`memberId` is `null`) simply match nothing.

Same idea for `lookupAuthMemberFollowed({ followerId, followingId })` → `meFollowed`.

`lookupAuthMemberLiked` takes a second argument so it can be pointed at a field other than `$_id` —
in the follow lists it is called as `lookupAuthMemberLiked(memberId, '$followingId')`.

### 14.4 The join-collection list (favorites / history)

Aggregate the **join** collection, `$lookup` the target, `$unwind`, then re-map so the client still
gets `Products`:

```ts
const data: T = await this.likeModel.aggregate([
  { $match: { likeGroup: LikeGroup.PRODUCT, memberId } },
  { $sort: { updatedAt: -1 } },
  { $lookup: { from: 'products', localField: 'likeRefId', foreignField: '_id', as: 'favoriteProduct' } },
  { $unwind: '$favoriteProduct' },
  {
    $facet: {
      list: [
        { $skip: (page - 1) * limit },
        { $limit: limit },
        lookupFavorite,                              // seller of the favorited product
        { $unwind: '$favoriteProduct.memberData' },
      ],
      metaCounter: [{ $count: 'total' }],
    },
  },
]).exec();

const result: Products = { list: [], metaCounter: data[0].metaCounter };
result.list = data[0].list.map((ele) => ele.favoriteProduct);
return result;
```

### 14.5 `$lookup` naming rule

`localField` is the foreign key, `as` is `<entity>Data`, and every `$lookup` is followed by
`{ $unwind: '$<entity>Data' }` when the relation is to-one. That is why output DTOs declare
`memberData?: Member` rather than `member?: Member`.

---

## 15. Denormalized Counters — the StatisticModifier Pattern

Every entity that owns counters exposes exactly one mutator, named `<entity>StatsEditor`, and it is
**public** so sibling services can call it:

```ts
public async productStatsEditor(input: StatisticModifier): Promise<Product> {
  const { _id, targetKey, modifier } = input;
  return await this.productModel
    .findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
    .exec();
}
```

Counter inventory in the reference (reproduce the equivalent set):

| Document | Counters | Bumped by |
|---|---|---|
| `Member` | `memberProducts`, `memberArticles`, `memberFollowers`, `memberFollowings`, `memberLikes`, `memberViews`, `memberComments`, `memberPoints`, `memberRank`, `memberWarnings`, `memberBlocks` | `ProductService`, `BoardArticleService`, `FollowService`, `CommentService`, `MemberService`, batch |
| `Product` | `productViews`, `productLikes`, `productComments`, `productRank` | `ProductService`, `CommentService`, batch |
| `BoardArticle` | `articleViews`, `articleLikes`, `articleComments` | `BoardArticleService`, `CommentService` |

Rules:

* Always `$inc`, never read-modify-write.
* Always pass `{ new: true }` and return the updated document — callers return it straight to GraphQL.
* The `modifier` is supplied by the caller and may be `-1` (unlike, unfollow, soft delete).
* When a soft delete removes a resource, the owner's counter is decremented in the **same** service
  method that performed the update.
* `*Rank` counters are **not** maintained transactionally — they are recomputed nightly by the batch
  app (§17).

---

## 16. File Upload

Two mutations live on the **actor** resolver (`member.resolver.ts`) and serve the whole app — there
is no separate upload feature.

```ts
@UseGuards(AuthGuard)
@Mutation(() => String)
public async imageUploader(
  @Args({ name: 'file', type: () => GraphQLUpload }) file: Promise<FileUpload> | FileUpload,
  @Args('target') target: String,                         // 'member' | 'product' | 'article'
): Promise<string> {
  console.log('Mutation: imageUploader');
  const { createReadStream, filename, mimetype } = await file;

  if (!filename) throw new Error(Message.UPLOAD_FAILED);
  if (!isValidImage(filename, mimetype)) throw new Error(Message.PROVIDE_ALLOWED_FORMAT);

  const imageName = getSerialForImage(filename);          // uuid + original extension
  const url = `uploads/${target}/${imageName}`;
  const stream = createReadStream();

  const result = await new Promise((resolve, reject) => {
    stream.pipe(createWriteStream(url))
      .on('finish', async () => resolve(true))
      .on('error', () => reject(false));
  });
  if (!result) throw new Error(Message.UPLOAD_FAILED);
  return url;                                             // stored on the entity as a plain string
}
```

`imagesUploader` is the batch version: it maps the file list through the same logic, writes each
result into `uploadedImages[index]` to preserve order, swallows per-file errors, and awaits
`Promise.all(promisedList)`.

**Contract:** upload first, get back the relative path(s), then send those strings inside
`createProduct` / `updateMember`. The server never couples upload to entity creation.

Requirements for this to work:
* `uploads: false` in the GraphQL module config (Apollo's own upload handling must be off).
* `graphqlUploadExpress({ maxFileSize, maxFiles })` mounted in `main.ts` **before** the GraphQL route.
* `app.use('/uploads', express.static('./uploads'))` so the files are publicly readable.
* The target directories must exist on disk (`uploads/member`, `uploads/product`, `uploads/article`).

---

## 17. Batch (Cron) Application

A **second Nest application** in the same monorepo. It connects to the same MongoDB and reuses the
API app's schemas, DTOs and enums by direct path import — no shared library package.

### `batch.module.ts`

```ts
@Module({
  imports: [
    ConfigModule.forRoot(),
    DatabaseModule,                                  // its own copy, same content as the API's
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([{ name: 'Product', schema: ProductSchema }]),
    MongooseModule.forFeature([{ name: 'Member',  schema: MemberSchema  }]),
  ],
  controllers: [BatchController],
  providers: [BatchService],
})
export class BatchModule {}
```

Note the cross-app import: `import ProductSchema from 'apps/<project>-api/src/schemas/Product.model';`

### `lib/config.ts` — job-name constants

```ts
/**********************************
 *        BATCH CONSTANTS         *
 **********************************/
export const BATCH_ROLLBACK = 'BATCH_ROLLBACK';
export const BATCH_TOP_PRODUCTS = 'BATCH_TOP_PRODUCTS';
export const BATCH_TOP_SELLERS = 'BATCH_TOP_SELLERS';
```

### `batch.controller.ts` — scheduling only

The controller owns the schedule and the logging; it never contains logic.

```ts
@Controller()
export class BatchController {
  private logger: Logger = new Logger('BatchController');
  constructor(private readonly batchService: BatchService) {}

  @Timeout(1000)
  handleTimeout() {
    this.logger.debug('BATCH SERVER READY!');
  }

  @Cron('00 00 01 * * *', { name: BATCH_ROLLBACK })
  public async batchRollback() {
    try {
      this.logger['context'] = BATCH_ROLLBACK;
      this.logger.debug('EXECUTED');
      await this.batchService.batchRollback();
    } catch (err) {
      this.logger.error(err);
    }
  }

  @Cron('20 00 01 * * *', { name: BATCH_TOP_PRODUCTS })
  public async batchTopProducts() { /* same shape */ }

  @Cron('40 00 01 * * *', { name: BATCH_TOP_SELLERS })
  public async batchTopSellers() { /* same shape */ }

  @Get()
  getHello(): string { return this.batchService.getHello(); }
}
```

Every job follows the identical five-line body: set logger context → `debug('EXECUTED')` → await the
service → catch and `logger.error`. The cron expressions are **staggered by 20 seconds** so rollback
always finishes before the ranking jobs read the zeroed ranks.

### `batch.service.ts` — the jobs

```ts
/** 1. Reset every rank to 0 so the ranking jobs have a clean slate. */
public async batchRollback(): Promise<void> {
  await this.productModel.updateMany({ productStatus: ProductStatus.ACTIVE }, { productRank: 0 }).exec();
  await this.memberModel.updateMany(
    { memberStatus: MemberStatus.ACTIVE, memberType: MemberType.SELLER },
    { memberRank: 0 },
  ).exec();
}

/** 2. Weighted popularity score for products. */
public async batchTopProducts(): Promise<void> {
  const products: Product[] = await this.productModel
    .find({ productStatus: ProductStatus.ACTIVE, productRank: 0 })
    .exec();

  const promisedList = products.map(async (ele: Product) => {
    const { _id, productLikes, productViews } = ele;
    const rank = productLikes * 2 + productViews * 1;
    return await this.productModel.findByIdAndUpdate(_id, { productRank: rank });
  });
  await Promise.all(promisedList);
}

/** 3. Weighted score for sellers. */
public async batchTopSellers(): Promise<void> {
  const sellers: Member[] = await this.memberModel
    .find({ memberType: MemberType.SELLER, memberStatus: MemberStatus.ACTIVE, memberRank: 0 })
    .exec();

  const promisedList = sellers.map(async (ele: Member) => {
    const { _id, memberProducts, memberLikes, memberArticles, memberViews } = ele;
    const rank = memberProducts * 5 + memberArticles * 3 + memberLikes * 2 + memberViews * 1;
    return await this.memberModel.findByIdAndUpdate(_id, { memberRank: rank });
  });
  await Promise.all(promisedList);
}
```

Pattern: **rollback → recompute**, filtering on `rank: 0` so a rerun is idempotent and a crashed job
resumes where it stopped. Weights encode business priorities — tune them for commerce, e.g.
`productRank = productOrders * 5 + productLikes * 2 + productViews * 1`.

Run it with `npm run start:dev:batch`. It exposes only a health `GET /` on `PORT_BATCH`.

---

## 18. WebSocket Layer

`src/socket/` sits beside `components/`, is imported directly by `AppModule`, and uses the raw `ws`
adapter (registered in `main.ts` with `app.useWebSocketAdapter(new WsAdapter(app))`).

```ts
@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
  private logger: Logger = new Logger('SocketEventsGateway');
  private summaryClient: number = 0;

  public afterInit(server: Server) {
    this.logger.log(`WebSocket Server initialized total: ${this.summaryClient}`);
  }

  handleConnection(client: WebSocket, ...args: any[]) {
    this.summaryClient++;
    this.logger.log(`== Client connected total: ${this.summaryClient} ==`);
  }

  handleDisconnect(client: WebSocket) {
    this.summaryClient--;
    this.logger.log(`== Client disconnected left total: ${this.summaryClient} ==`);
  }

  @SubscribeMessage('message')
  public handleMessage(client: WebSocket, payload: any): string {
    return 'Hello world!';
  }
}
```

The reference implementation is a connection-counting skeleton. The intended growth path — and what
the e-commerce project should build on it:

* keep a `Map<WebSocket, Member>` populated by verifying the bearer token on connect (reuse
  `AuthService.verifyToken`);
* broadcast order-status changes to the buyer and the seller;
* push `Notification` documents in real time when a like/comment/order event fires;
* a live "N people viewing this product" counter fed from `ViewService`.

Keep the gateway **outside** `components/` — it is infrastructure, not a domain feature.

---

## 19. Error Handling

Three cooperating layers, no try/catch in resolvers:

1. **Services throw Nest HTTP exceptions with `Message` constants.**
   * `BadRequestException` — driver/validation failures on write (`CREATE_FAILED`,
     `USED_MEMBER_NICK_OR_PHONE`), and forbidden request shapes (`NOT_ALLOWED_REQUEST`).
   * `InternalServerErrorException` — "expected" domain failures: not found, update failed,
     wrong password, blocked user. (Semantically these should be 404/401/403; see §23.)
   * `UnauthorizedException` / `ForbiddenException` — thrown from the guards only.
2. **Mongo write failures are caught and translated** at the boundary:
   ```ts
   try {
     const result = await this.model.create(input);
   } catch (err) {
     console.log('Error, Service.model:', err.message);
     throw new BadRequestException(Message.CREATE_FAILED);
   }
   ```
   The raw driver error is logged server-side and never leaks to the client.
3. **`formatError` in `AppModule`** flattens whatever reaches Apollo into `{ code, message }` and logs
   it as `GRAPHQL GLOBAL ERROR`.

The result: one predictable client-facing error envelope, and a single file (`common.enum.ts`) that
lists every message the API can produce.

**Convention for "no rows":** list queries `throw NO_DATA_FOUND` when the aggregation returns an
empty array, rather than returning an empty list. Decide this consciously for the new project —
returning `{ list: [], metaCounter: [] }` is friendlier for a shop's browse page, and is the one
place worth deviating.

---

## 20. Full GraphQL API surface of the reference project

Use this as the completeness checklist when porting.

### Member (actor)

| Operation | Kind | Guard | Purpose |
|---|---|---|---|
| `signup(input: MemberInput)` | Mutation | — | create account, returns member + `accessToken` |
| `login(input: LoginInput)` | Mutation | — | returns member + `accessToken` |
| `checkAuth` | Query | `AuthGuard` | token smoke test |
| `checkAuthRoles` | Query | `RolesGuard(USER, AGENT)` | role smoke test |
| `updateMember(input: MemberUpdate)` | Mutation | `AuthGuard` | self-update, re-issues token |
| `getMember(memberId: String)` | Query | `WithoutGuard` | profile + view record + `meLiked` + `meFollowed` |
| `getAgents(input: AgentsInquiry)` | Query | `WithoutGuard` | paginated seller directory |
| `likeTargetMember(memberId: String)` | Mutation | `AuthGuard` | toggle profile like |
| `getAllMembersByAdmin(input: MembersInquiry)` | Query | `RolesGuard(ADMIN)` | admin list |
| `updateMembersByAdmin(input: MemberUpdate)` | Mutation | `RolesGuard(ADMIN)` | block/unblock/promote |
| `imageUploader(file, target)` | Mutation | `AuthGuard` | single image |
| `imagesUploader(files, target)` | Mutation | `AuthGuard` | multiple images |

### Property (primary resource) → your Product

| Operation | Kind | Guard |
|---|---|---|
| `createProperty(input: PropertyInput)` | Mutation | `RolesGuard(AGENT)` |
| `getProperty(propertyId: String)` | Query | `WithoutGuard` |
| `updateProperty(input: PropertyUpdate)` | Mutation | `RolesGuard(AGENT)` |
| `getProperties(input: PropertiesInquiry)` | Query | `WithoutGuard` |
| `getFavorites(input: OrdinaryInquiry)` | Query | `AuthGuard` |
| `getVisited(input: OrdinaryInquiry)` | Query | `AuthGuard` |
| `getAgentProperties(input: AgentPropertiesInquiry)` | Query | `RolesGuard(AGENT)` |
| `likeTargetProperty(propertyId: String)` | Mutation | `AuthGuard` |
| `getAllPropertiesByAdmin(input: AllPropertiesInquiry)` | Query | `RolesGuard(ADMIN)` |
| `updatePropertyByAdmin(input: PropertyUpdate)` | Mutation | `RolesGuard(ADMIN)` |
| `removePropertyByAdmin(propertyId: String)` | Mutation | `RolesGuard(ADMIN)` |

### BoardArticle

`createBoardArticle`, `getBoardArticle`, `updateBoardArticle`, `getBoardArticles`,
`likeTargetBoardArticle`, `getAllBoardArticlesByAdmin`, `updateBoardArticleByAdmin`,
`removeBoardArticleByAdmin` — same guard pattern, `AuthGuard` for create/update (any member may post).

### Comment

`createComment`, `updateComment`, `getComments`, `removeCommentByAdmin`.

### Follow

`subscribe`, `unsubscribe`, `getMemberFollowings`, `getMemberFollowers`.

### Like / View

No resolvers. Surfaced through `likeTarget*`, `meLiked`, `getFavorites`, `getVisited`.

---

## 21. E-commerce API surface to build

Everything above ports 1:1. What follows is the commerce-specific tier D, built with the **same**
patterns (three files, `$facet` lists, `StatisticModifier` counters, guards).

### Schemas to add

```
Order           orderStatus:   PAUSE | PROCESS | FINISH | CANCEL   (enum + registerEnumType)
                orderTotal:    Number   (sum of items, computed server-side — never trusted from client)
                orderDelivery: Number
                memberId:      ObjectId ref Member  (the buyer)
                deletedAt:     Date
                collection: 'orders', timestamps: true

OrderItem       itemQuantity:  Number, required
                itemPrice:     Number, required   (price snapshot at purchase time)
                productId:     ObjectId ref Product
                orderId:       ObjectId ref Order
                collection: 'orderItems', timestamps: true
                OrderItemSchema.index({ orderId: 1, productId: 1 }, { unique: true })
```

The cart is modelled as an `Order` in `PAUSE` state — no separate collection. `createOrder` moves it
to `PROCESS`. This keeps one aggregation path for cart and order history.

### Resolver surface (`order/order.resolver.ts`)

| Operation | Kind | Guard | Service logic |
|---|---|---|---|
| `createOrder(input: [OrderItemInput])` | Mutation | `AuthGuard` | insert `Order` (PAUSE) + `OrderItem[]`, compute `orderTotal` server-side from current `productPrice`, verify `productStock` |
| `getMyOrders(input: OrdinaryInquiry)` | Query | `AuthGuard` | `$facet` over `orders` matched on `memberId` + `orderStatus`, `$lookup` `orderItems`, `$lookup` `products` |
| `updateOrder(input: OrderUpdate)` | Mutation | `AuthGuard` | status transition; on `PROCESS` decrement `productStock` and bump `memberPoints`; on `CANCEL` restore stock |
| `getSellerOrders(input: OrdinaryInquiry)` | Query | `RolesGuard(SELLER)` | orders containing this seller's products |
| `getAllOrdersByAdmin(input: AllOrdersInquiry)` | Query | `RolesGuard(ADMIN)` | admin list |
| `updateOrderByAdmin(input: OrderUpdate)` | Mutation | `RolesGuard(ADMIN)` | force status |

### The one new pattern — nested `$lookup` for order lines

```ts
const result = await this.orderModel.aggregate([
  { $match: { memberId, orderStatus } },
  { $sort: { updatedAt: Direction.DESC } },
  {
    $lookup: {
      from: 'orderItems',
      localField: '_id',
      foreignField: 'orderId',
      as: 'orderItems',
    },
  },
  {
    $lookup: {
      from: 'products',
      localField: 'orderItems.productId',
      foreignField: '_id',
      as: 'productData',
    },
  },
  {
    $facet: {
      list: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      metaCounter: [{ $count: 'total' }],
    },
  },
]).exec();
```

### Stock — the one place needing care

`productStock` is a counter like any other, so it uses `productStatsEditor`:

```ts
await this.productService.productStatsEditor({
  _id: item.productId, targetKey: 'productStock', modifier: -item.itemQuantity,
});
```

But unlike likes and views, overselling matters. Guard it with a conditional update rather than a
read-then-write:

```ts
const result = await this.productModel.findOneAndUpdate(
  { _id: productId, productStock: { $gte: quantity } },     // the check IS the filter
  { $inc: { productStock: -quantity } },
  { new: true },
).exec();
if (!result) throw new BadRequestException(Message.NOT_ENOUGH_STOCK);
```

When `productStock` reaches 0, set `productStatus = SOLD_OUT` and stamp `soldOutAt` in the same
service method — mirroring how `updateProperty` stamps `soldAt`.

### Additional e-commerce endpoints worth adding, same patterns

* `getMyCart` / `addToCart` / `removeFromCart` — thin wrappers over the `PAUSE` order.
* `createReview` — `Comment` with `commentGroup: PRODUCT` plus `commentRating`.
* `getTopProducts` — a `getProducts` call sorted by `productRank` (fed by the batch app).
* `getRelatedProducts` — `getProducts` with `categoryList` from the current product, excluding `_id`.
* `getSellerProducts` — the reference's `getAgentProperties`, renamed.

---

## 22. Build Order — do it in this sequence

Following this order means nothing is ever blocked on something unwritten.

1. **Scaffold.** `nest new`, then `nest generate app <project>-batch`, set `"monorepo": true`.
   Install the dependency set from §1. Write `.env`, `.gitignore`, `.prettierrc`, `eslint.config.mjs`.
2. **`libs/types/common.ts`** — `T`, `StatisticModifier`.
3. **`libs/enums/common.enum.ts`** — `Message`, `Direction`.
4. **All other enum files** — one per entity, each `registerEnumType`'d.
5. **`libs/config.ts`** — sort whitelists, image helpers, `shapeIntoMongoObjectId`. Leave the
   `$lookup` fragments until §14 is needed.
6. **`schemas/`** — every Mongoose schema up front; they are cheap and everything downstream refers
   to them.
7. **`database/database.module.ts`**, then `app.module.ts` + `main.ts` + the trivial
   `app.controller/service/resolver`. **Boot the server here** — `sayHello` must work and MongoDB must
   log as connected before you write a single feature.
8. **`libs/interceptor/Logging.interceptor.ts`** and register it.
9. **`auth/`** — module, service, both decorators, all three guards. No resolver.
10. **`member/`** — DTOs (`member.ts`, `member.input.ts`, `member.update.ts`) including `TotalCounter`
    and `Members`, then module/resolver/service: `signup` → `login` → `checkAuth` → `checkAuthRoles`
    → `updateMember`. Test each in the playground before moving on.
11. **`view/`** — service only, plus `ViewInput` / `View` DTOs. Wire `recordView` into `getMember`.
12. **`like/`** — service only. Wire `checkLikeExistance` + `toggleLike` into `likeTargetMember`.
13. **`libs/config.ts` lookups** — `lookupMember`, `lookupAuthMemberLiked`. Then `getAgents`/`getSellers`
    with the full `$facet` aggregation.
14. **`product/`** — the whole tier-B feature: create → getOne (views + meLiked + memberData) → update
    (with `soldOutAt`/`deletedAt` stamping) → list (with `shapeMatchQuery`) → seller list → like →
    admin trio.
15. **`getFavorites` / `getVisited`** — the join-collection aggregations in `LikeService` /
    `ViewService`, exposed on the product resolver.
16. **`follow/`** — `subscribe`, `unsubscribe`, both list queries, `lookupAuthMemberFollowed`.
17. **`board-article/`** — a straight copy of the product feature, lighter.
18. **`comment/`** — the polymorphic switch; requires the three services above it to exist.
19. **Uploads** — `imageUploader` / `imagesUploader` on the member resolver; create the `uploads/*`
    directories.
20. **`order/`** — tier D (§21).
21. **`<project>-batch`** — rollback + ranking jobs.
22. **`socket/`** — gateway, then notifications.

---

## 23. Known defects in the reference — fix these when copying

The reference is a learning project. These are real bugs and rough edges in it; do **not** reproduce
them.

| Where | Issue | Fix |
|---|---|---|
| `comment.service.ts` `createComment` | `const result` is re-declared inside `try`, shadowing the outer `let result = null`, so the method always throws `CREATE_FAILED` after successfully writing and bumping the counter | assign to the outer variable: `result = await this.commentModel.create(input);` |
| `property.service.ts` `getProperties` | default sort key is misspelled `'craetedAt'` | `'createdAt'` |
| `member.service.ts` `getAllMembersByAdmin` | filters on `match.MemberStatus` (capital M), so the status filter silently never applies | `match.memberStatus` |
| `Like.model.ts` | `likeGroup` is typed with the `ViewGroup` enum | use `LikeGroup` |
| `member.service.ts` `getMember` | `findByIdAndUpdate(search, ...)` is passed a filter object where an id is expected | `findByIdAndUpdate(targetId, ...)` |
| `board-article.service.ts` `getBoardArticle` | the `meLiked` lookup runs outside the `if (memberId)` block, so anonymous reads do a pointless query with a null member | move it inside |
| `board-article.service.ts` `getBoardArticles` | reads `input.articleCategory` instead of `input.search.articleCategory` | read from `search` |
| `property.update.ts` | `deletedAt: Date` is declared non-optional | `deletedAt?: Date` |
| Everywhere | `//@ts-ignore` is used to paper over `ObjectId` typing between `mongoose` and `bson` | import `ObjectId` from **one** source (`mongoose`) and type DTO ids as `ObjectId`; the `@ts-ignore` count should be near zero |
| Services | domain failures throw `InternalServerErrorException` (HTTP 500) | use `NotFoundException`, `UnauthorizedException`, `ForbiddenException`, `BadRequestException` to match semantics |
| List queries | throw `NO_DATA_FOUND` on an empty result | return `{ list: [], metaCounter: [] }` for browse pages |
| `auth.service.ts` `createToken` | the entire member document (including counters) becomes the JWT payload — large token, stale data | sign `{ _id, memberNick, memberType, memberStatus }` only, and load the rest when needed |
| Comments | some code comments are in Uzbek | write them in one language |

---

## Quick reference card

```
Feature = 3 files            module (wiring) + resolver (thin) + service (logic)
Entity  = 3 DTO files        <e>.ts (@ObjectType) + <e>.input.ts + <e>.update.ts
Entity  = 1 schema file      schemas/<E>.model.ts, default export, plain new Schema()
Entity  = 1 enum file        libs/enums/<e>.enum.ts, registerEnumType each

Field naming                 <entity><Field>  →  productPrice, memberNick, likeRefId
List query arg               { page, limit, sort?, direction?, search }
List query result            { list, metaCounter }
List query pipeline          $match → $sort → $facet{ list:[$skip,$limit,...lookups], metaCounter:[$count] }
Counter update               <entity>StatsEditor({ _id, targetKey, modifier })  →  $inc
Id conversion                shapeIntoMongoObjectId(input)  in the resolver, always
Guards                       AuthGuard (required) | RolesGuard (+@Roles) | WithoutGuard (optional)
Caller injection             @AuthMember('_id') memberId  /  @AuthMember() authMember
Errors                       throw <NestException>(Message.CONSTANT)  →  formatError
Soft delete                  status enum DELETE + deletedAt stamped by the service
Cross-feature writes         import the owning module, call its exported service
```
