import endpointSpec from '../../server/ADK_SPEC.md/endpoint-spec.md?raw';
import platformSpec from '../../server/ADK_SPEC.md/platform-spec.md?raw';
import frameworkSpec from '../../server/ADK_SPEC.md/framework-integration.md?raw';

export { endpointSpec, platformSpec, frameworkSpec };
export const ADK_SPEC_FALLBACK = [platformSpec, endpointSpec, frameworkSpec].join('\n\n');
