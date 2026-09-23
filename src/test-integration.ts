import { runE2EEUnitTest } from './lib/test-e2ee';

export { runE2EEUnitTest };
export const testIntegration = runE2EEUnitTest;
export const runIntegrationTest = runE2EEUnitTest;
export default runE2EEUnitTest;
