import { TicketMarkdownEditor } from '@core/features/projects/components/ticket-markdown-editor';

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
    <TicketMarkdownEditor
      editable={!disabled}
      onChangeText={onChangeText}
      placeholder="Markdown 설명을 입력하세요."
      value={value}
    />
  );
}
