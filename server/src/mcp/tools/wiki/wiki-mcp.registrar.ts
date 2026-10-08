import { Inject, Injectable } from '@nestjs/common';

import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';
import { wikiDocumentReceipt } from '@/mcp/tools/mcp-mutation-receipt.mapper';
import {
  wikiDocumentCreateTool,
  wikiDocumentGetTool,
  wikiDocumentUpdateTool,
  wikiSearchTool,
} from '@/mcp/tools/wiki/wiki-tool-definitions';
import { WikiService } from '@/wiki/wiki.service';

type WikiToolsService = Pick<
  WikiService,
  'search' | 'getDocument' | 'createDocument' | 'updateDocument'
>;

@Injectable()
export class WikiMcpRegistrar {
  constructor(
    @Inject(WikiService)
    private readonly wikiService: WikiToolsService,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(wikiSearchTool, async (input, auth) => {
        const { organizationId, ...query } = input;
        return this.wikiService.search(
          toMcpOrganizationActor(auth),
          organizationId,
          query,
        );
      }),
      bindMcpTool(wikiDocumentGetTool, async (input, auth) =>
        this.wikiService.getDocument(
          toMcpOrganizationActor(auth),
          input.organizationId,
          input.documentId,
        ),
      ),
      bindMcpTool(wikiDocumentCreateTool, async (input, auth) => {
        const { organizationId, ...body } = input;
        const result = await this.wikiService.createDocument(
          toMcpOrganizationActor(auth),
          organizationId,
          body,
        );
        return { result, mutation: wikiDocumentReceipt(result, 'created') };
      }),
      bindMcpTool(wikiDocumentUpdateTool, async (input, auth) => {
        const { organizationId, documentId, ...body } = input;
        const result = await this.wikiService.updateDocument(
          toMcpOrganizationActor(auth),
          organizationId,
          documentId,
          body,
        );
        return { result, mutation: wikiDocumentReceipt(result, 'updated') };
      }),
    ];
  }
}
