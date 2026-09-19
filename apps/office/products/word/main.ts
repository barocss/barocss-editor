import { mountWorkspaceProduct } from '../../src/host';
void mountWorkspaceProduct('word', () => import('../../../word/src/main'));
