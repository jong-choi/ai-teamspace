import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { Link, Redirect, useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Label } from '@repo/client/rnr/components/ui/label';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  type DashboardPlatformValue,
  useDashboardPlatform,
} from '@core/app/platform/dashboard-platform';
import { DashboardInput } from '@core/app/ui/dashboard-input';

import { Eye, EyeOff } from 'lucide-react-native';

export function LoginRoute() {
  const { authentication, currentUserId, sessionPending } =
    useDashboardPlatform();
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const form = useForm<
    Parameters<DashboardPlatformValue['authentication']['signIn']['email']>[0]
  >({
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  if (sessionPending) return <AuthenticationLoading />;
  if (currentUserId) return <Redirect href="/onboarding" />;

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    const result = await authentication.signIn.email(values);
    if (result.error) {
      form.setError('root', {
        message: result.error.message ?? '로그인 정보를 확인해 주세요.',
      });
      return;
    }
    router.replace('/onboarding');
  });

  return (
    <AuthenticationFrame
      footer={
        <AuthenticationSwitch
          href="/signup"
          label="계정이 없으신가요?"
          linkLabel="회원가입"
        />
      }
      title="로그인"
    >
      <View className="gap-4">
        <Controller
          control={form.control}
          name="email"
          rules={{
            required: '이메일을 입력해 주세요.',
            pattern: {
              message: '올바른 이메일 주소를 입력해 주세요.',
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            },
          }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="login-email">이메일</Label>
              <DashboardInput
                accessibilityLabel="이메일"
                aria-invalid={fieldState.invalid}
                autoCapitalize="none"
                autoComplete="email"
                className="shadow-none"
                editable={!form.formState.isSubmitting}
                keyboardType="email-address"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="name@company.com"
                value={field.value}
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          rules={{ required: '비밀번호를 입력해 주세요.' }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="login-password">비밀번호</Label>
              <View className="relative">
                <DashboardInput
                  accessibilityLabel="비밀번호"
                  aria-invalid={fieldState.invalid}
                  autoComplete="current-password"
                  className="pr-11 shadow-none"
                  editable={!form.formState.isSubmitting}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="비밀번호"
                  secureTextEntry={!passwordVisible}
                  value={field.value}
                />
                <PasswordVisibilityButton
                  disabled={form.formState.isSubmitting}
                  onToggle={() => setPasswordVisible((visible) => !visible)}
                  visible={passwordVisible}
                />
              </View>
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <FieldError message={form.formState.errors.root?.message} />
        <Button
          className="shadow-none"
          disabled={form.formState.isSubmitting}
          onPress={() => void submit()}
        >
          {form.formState.isSubmitting ? (
            <ActivityIndicator
              className="text-primary-foreground"
              size="small"
            />
          ) : null}
          <Text>로그인</Text>
        </Button>
      </View>
    </AuthenticationFrame>
  );
}

export function SignupRoute() {
  const { authentication, currentUserId, sessionPending } =
    useDashboardPlatform();
  const router = useRouter();
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const form = useForm<
    Parameters<DashboardPlatformValue['authentication']['signUp']['email']>[0] &
      Record<'confirmPassword', string>
  >({
    defaultValues: {
      confirmPassword: '',
      email: '',
      name: '',
      password: '',
      username: '',
    },
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  if (sessionPending) return <AuthenticationLoading />;
  if (currentUserId) return <Redirect href="/onboarding" />;

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    const result = await authentication.signUp.email({
      email: values.email,
      name: values.name,
      password: values.password,
      username: values.username,
    });
    if (result.error) {
      form.setError('root', {
        message: result.error.message ?? '회원가입 정보를 확인해 주세요.',
      });
      return;
    }
    router.replace('/onboarding');
  });

  return (
    <AuthenticationFrame
      footer={
        <AuthenticationSwitch
          href="/login"
          label="이미 계정이 있으신가요?"
          linkLabel="로그인"
        />
      }
      title="회원가입"
    >
      <View className="gap-4">
        <Controller
          control={form.control}
          name="name"
          rules={{ required: '이름을 입력해 주세요.' }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="signup-name">이름</Label>
              <DashboardInput
                accessibilityLabel="이름"
                aria-invalid={fieldState.invalid}
                autoComplete="name"
                className="shadow-none"
                editable={!form.formState.isSubmitting}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="홍길동"
                value={field.value}
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <Controller
          control={form.control}
          name="username"
          rules={{
            pattern: {
              message: '영문, 숫자, 밑줄, 마침표로 3~30자를 입력해 주세요.',
              value: /^[A-Za-z0-9_.]{3,30}$/,
            },
            required: '사용자명을 입력해 주세요.',
          }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="signup-username">사용자명</Label>
              <DashboardInput
                accessibilityLabel="사용자명"
                aria-invalid={fieldState.invalid}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                className="shadow-none"
                editable={!form.formState.isSubmitting}
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="gildong"
                value={field.value ?? ''}
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <Controller
          control={form.control}
          name="email"
          rules={{
            required: '이메일을 입력해 주세요.',
            pattern: {
              message: '올바른 이메일 주소를 입력해 주세요.',
              value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            },
          }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="signup-email">이메일</Label>
              <DashboardInput
                accessibilityLabel="이메일"
                aria-invalid={fieldState.invalid}
                autoCapitalize="none"
                autoComplete="email"
                className="shadow-none"
                editable={!form.formState.isSubmitting}
                keyboardType="email-address"
                onBlur={field.onBlur}
                onChangeText={field.onChange}
                placeholder="name@company.com"
                value={field.value}
              />
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <Controller
          control={form.control}
          name="password"
          rules={{
            minLength: {
              message: '비밀번호는 8자 이상 입력해 주세요.',
              value: 8,
            },
            maxLength: {
              message: '비밀번호는 128자 이하로 입력해 주세요.',
              value: 128,
            },
            required: '비밀번호를 입력해 주세요.',
          }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="signup-password">비밀번호</Label>
              <View className="relative">
                <DashboardInput
                  accessibilityLabel="비밀번호"
                  aria-invalid={fieldState.invalid}
                  autoComplete="new-password"
                  className="pr-11 shadow-none"
                  editable={!form.formState.isSubmitting}
                  maxLength={128}
                  onBlur={field.onBlur}
                  onChangeText={(value) => {
                    field.onChange(value);
                    if (form.getValues('confirmPassword')) {
                      void form.trigger('confirmPassword');
                    }
                  }}
                  placeholder="8자 이상 입력"
                  secureTextEntry={!passwordVisible}
                  value={field.value}
                />
                <PasswordVisibilityButton
                  disabled={form.formState.isSubmitting}
                  onToggle={() => setPasswordVisible((visible) => !visible)}
                  visible={passwordVisible}
                />
              </View>
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <Controller
          control={form.control}
          name="confirmPassword"
          rules={{
            required: '비밀번호를 한 번 더 입력해 주세요.',
            validate: (value) =>
              value === form.getValues('password') ||
              '비밀번호가 일치하지 않습니다.',
          }}
          render={({ field, fieldState }) => (
            <View className="gap-1.5">
              <Label nativeID="signup-confirm-password">비밀번호 확인</Label>
              <View className="relative">
                <DashboardInput
                  accessibilityLabel="비밀번호 확인"
                  aria-invalid={fieldState.invalid}
                  autoComplete="new-password"
                  className="pr-11 shadow-none"
                  editable={!form.formState.isSubmitting}
                  maxLength={128}
                  onBlur={field.onBlur}
                  onChangeText={field.onChange}
                  placeholder="비밀번호 다시 입력"
                  secureTextEntry={!confirmationVisible}
                  value={field.value}
                />
                <PasswordVisibilityButton
                  disabled={form.formState.isSubmitting}
                  onToggle={() => setConfirmationVisible((visible) => !visible)}
                  visible={confirmationVisible}
                />
              </View>
              <FieldError message={fieldState.error?.message} />
            </View>
          )}
        />
        <FieldError message={form.formState.errors.root?.message} />
        <Button
          className="shadow-none"
          disabled={form.formState.isSubmitting}
          onPress={() => void submit()}
        >
          {form.formState.isSubmitting ? (
            <ActivityIndicator
              className="text-primary-foreground"
              size="small"
            />
          ) : null}
          <Text>회원가입</Text>
        </Button>
      </View>
    </AuthenticationFrame>
  );
}

function AuthenticationFrame({
  children,
  footer,
  title,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  title: string;
}) {
  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="min-h-full items-center justify-center px-4 py-12"
      keyboardShouldPersistTaps="handled"
    >
      <View className="w-full max-w-md gap-6 rounded-xl border border-border bg-background p-6 sm:p-8">
        <Link href="/" asChild>
          <Pressable accessibilityRole="link" className="self-start">
            <Text className="text-sm font-bold tracking-tight">
              AI Teamspace
            </Text>
          </Pressable>
        </Link>
        <Text className="text-2xl font-semibold tracking-tight">{title}</Text>
        {children}
        {footer}
      </View>
    </ScrollView>
  );
}

function AuthenticationSwitch({
  href,
  label,
  linkLabel,
}: {
  href: '/login' | '/signup';
  label: string;
  linkLabel: string;
}) {
  return (
    <View className="flex-row items-center justify-center gap-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Link asChild href={href}>
        <Pressable accessibilityRole="link">
          <Text className="text-xs font-medium text-primary underline web:cursor-pointer">
            {linkLabel}
          </Text>
        </Pressable>
      </Link>
    </View>
  );
}

function AuthenticationLoading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator />
      <Text className="mt-3 text-xs text-muted-foreground">
        세션을 확인하는 중...
      </Text>
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? (
    <Text className="text-xs leading-5 text-destructive">{message}</Text>
  ) : null;
}

function PasswordVisibilityButton({
  disabled,
  onToggle,
  visible,
}: {
  disabled: boolean;
  onToggle: () => void;
  visible: boolean;
}) {
  return (
    <Button
      accessibilityLabel={visible ? '비밀번호 숨기기' : '비밀번호 보기'}
      className="absolute right-0 top-0 h-10 w-10 rounded-l-none shadow-none sm:h-9 sm:w-9"
      disabled={disabled}
      onPress={onToggle}
      size="icon"
      variant="ghost"
    >
      <Icon
        as={visible ? EyeOff : Eye}
        className="size-4 text-muted-foreground"
      />
    </Button>
  );
}
