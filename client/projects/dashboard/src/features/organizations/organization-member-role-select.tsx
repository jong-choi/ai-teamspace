import type {
  OrganizationAccess,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import {
  getOrganizationMemberRoleLabel,
  type OrganizationMemberRole,
  parseOrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';
import { getAssignableOrganizationMemberRoles } from '@core/features/organizations/organization-member-permissions';

export function OrganizationMemberRoleSelect({
  actorRole,
  disabled,
  member,
  onRoleChange,
}: {
  actorRole: OrganizationAccess['role'];
  disabled: boolean;
  member: OrganizationMember;
  onRoleChange: (role: OrganizationMemberRole) => void;
}) {
  const value = {
    label: getOrganizationMemberRoleLabel(member.role),
    value: member.role,
  };
  const roleOptions = getAssignableOrganizationMemberRoles(actorRole);

  return (
    <Select
      disabled={disabled}
      onValueChange={(option) => {
        const role = parseOrganizationMemberRole(option?.value);
        if (!role || role === member.role) return;
        onRoleChange(role);
      }}
      value={value}
    >
      <SelectTrigger
        accessibilityLabel={`${member.user.name} 역할 변경`}
        className="min-w-28"
        disabled={disabled}
        size="sm"
      >
        <SelectValue placeholder="역할" />
      </SelectTrigger>
      <SelectContent align="start" side="bottom">
        {roleOptions.map((role) => (
          <SelectItem
            key={role}
            label={getOrganizationMemberRoleLabel(role)}
            value={role}
          >
            {getOrganizationMemberRoleLabel(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
