import { runE2EEUnitTest } from './lib/test-e2ee';

export async function runIntegrationTest(): Promise<boolean> {
  return runE2EEUnitTest();
}

export async function testIntegration(): Promise<boolean> {
  return runE2EEUnitTest();
}

export { runE2EEUnitTest };
export default runIntegrationTest;

