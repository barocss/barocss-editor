import { mountWorkspaceProduct } from '../../src/host';
void mountWorkspaceProduct('note', () => import('../../../note/src/main'));
