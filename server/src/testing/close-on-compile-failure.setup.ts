import 'reflect-metadata';

import type { NestContainer } from '@nestjs/core';
import { ApplicationConfig } from '@nestjs/core';
import { GraphInspector } from '@nestjs/core/inspector/graph-inspector';
import { TestingModule, TestingModuleBuilder } from '@nestjs/testing';

// compile()이 provider 생성 도중 실패하면 이미 만들어진 Redis·DB 연결을 닫을 TestingModule이
// 호출자에게 돌아가지 않아 jest가 종료되지 않는다. 실패한 컨테이너를 Nest 종료 경로로 닫고 오류를 다시 던진다.
type BuilderInternals = {
  container: NestContainer;
  applicationConfig: ApplicationConfig;
};

const compile = TestingModuleBuilder.prototype.compile;

TestingModuleBuilder.prototype.compile = async function compileOrClose(
  this: TestingModuleBuilder,
  ...args: Parameters<TestingModuleBuilder['compile']>
): Promise<TestingModule> {
  try {
    return await compile.apply(this, args);
  } catch (error) {
    const { container, applicationConfig } =
      this as unknown as BuilderInternals;
    const [root] = container.getModules().values();
    if (root)
      await new TestingModule(
        container,
        new GraphInspector(container),
        root,
        applicationConfig,
      )
        .close()
        .catch(() => undefined);
    throw error;
  }
};
