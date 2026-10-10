import type { IncomingHttpHeaders } from 'node:http';

import {
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Put,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { USER_AVATAR_MAX_UPLOAD_BYTES } from '@/user-profile/domain/user-avatar-image';
import { UserAvatarTooLargeError } from '@/user-profile/domain/user-profile.error';
import { UserAvatarDto } from '@/user-profile/dto/user-avatar.dto';
import { UserProfileService } from '@/user-profile/user-profile.service';

import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';
import type { Request } from 'express';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('user-profile')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('users')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Put('me/avatar')
  @UseGuards(TrustedOriginGuard)
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ standardSchema: UserAvatarDto.schema })
  async replaceAvatar(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Req() request: Request,
  ): Promise<UserAvatarDto> {
    return this.userProfileService.replaceAvatar(
      headers,
      session.user.image,
      await readBoundedBody(request, USER_AVATAR_MAX_UPLOAD_BYTES),
    );
  }

  @Delete('me/avatar')
  @UseGuards(TrustedOriginGuard)
  @ApiOkResponse({ standardSchema: UserAvatarDto.schema })
  removeAvatar(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
  ): Promise<UserAvatarDto> {
    return this.userProfileService.removeAvatar(headers, session.user.image);
  }

  // <img>가 session 없이 읽는다. 파일 이름이 추측할 수 없는 UUID이고 내용이 바뀌지 않아 장기 cache한다.
  @Get('avatars/:fileName')
  @AllowAnonymous()
  @ApiProduces('image/webp')
  @ApiOkResponse({
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async readAvatar(
    @Param('fileName') fileName: string,
  ): Promise<StreamableFile> {
    const avatar = await this.userProfileService.readAvatar(fileName);
    return new StreamableFile(avatar.body, { type: avatar.contentType });
  }
}

// 전역 parser는 JSON만 읽으므로 binary body는 여기서 크기 제한을 걸고 직접 읽는다.
async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new UserAvatarTooLargeError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}
