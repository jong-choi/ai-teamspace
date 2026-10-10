import { useState } from 'react';
import { View } from 'react-native';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/client/rnr/components/ui/collapsible';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';

import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react-native';

export function AgentReasoningBlock({
  reasoning,
  thinking,
}: {
  reasoning: string;
  thinking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const preview = reasoning.replace(/\s+/gu, ' ').slice(-120);

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <View className="w-full rounded-lg border border-border/60 bg-muted/20">
        <CollapsibleTrigger
          accessibilityLabel={open ? '생각 접기' : '생각 펼치기'}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          className="flex-row items-center gap-2 px-3 py-2"
        >
          <Icon
            as={open ? ChevronDown : ChevronRight}
            className="size-3 text-muted-foreground"
          />
          <Icon as={Lightbulb} className="size-3 text-muted-foreground" />
          <Text className="text-xs font-medium text-muted-foreground">
            {thinking ? '생각 중' : '생각'}
          </Text>
          {thinking && !open ? (
            <Text
              className="min-w-0 flex-1 text-xs text-muted-foreground/80"
              numberOfLines={1}
            >
              {preview}
            </Text>
          ) : null}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <View className="border-t border-border/50 px-3 py-2">
            <Text className="text-xs leading-5 text-muted-foreground">
              {reasoning}
            </Text>
          </View>
        </CollapsibleContent>
      </View>
    </Collapsible>
  );
}
