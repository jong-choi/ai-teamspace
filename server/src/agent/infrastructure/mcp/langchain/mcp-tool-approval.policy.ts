import { Injectable } from '@nestjs/common';

export interface McpToolDescriptor {
  name: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class McpToolApprovalPolicy {
  isReadOnly(tool: McpToolDescriptor): boolean {
    const annotations = tool.metadata?.['annotations'];
    return (
      typeof annotations === 'object' &&
      annotations !== null &&
      'readOnlyHint' in annotations &&
      annotations.readOnlyHint === true
    );
  }

  readOnlyTools<T extends McpToolDescriptor>(tools: readonly T[]): T[] {
    return tools.filter((tool) => this.isReadOnly(tool));
  }

  interruptOn(tools: readonly McpToolDescriptor[]): Record<string, true> {
    return Object.fromEntries(
      tools
        .filter((tool) => !this.isReadOnly(tool))
        .map((tool) => [tool.name, true] as const),
    );
  }
}
