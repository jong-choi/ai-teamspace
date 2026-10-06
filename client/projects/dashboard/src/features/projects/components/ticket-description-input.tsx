import { Input } from '@repo/client/rnr/components/ui/input';

export function TicketDescriptionInput({
  disabled,
  onChangeText,
  value,
}: {
  disabled: boolean;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <Input
      accessibilityLabel="이슈 설명"
      className="min-h-20 py-2 text-xs"
      editable={!disabled}
      multiline
      onChangeText={onChangeText}
      placeholder="Markdown 설명을 입력하세요."
      textAlignVertical="top"
      value={value}
    />
  );
}
