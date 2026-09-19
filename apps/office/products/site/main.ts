import { mountWorkspaceProduct } from '../../src/host';
void mountWorkspaceProduct('site', () => import('../../../site/src/main'));
