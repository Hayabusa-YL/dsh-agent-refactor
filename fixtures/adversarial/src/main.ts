import { alpha } from './alpha';
import { beta } from '@/components/beta';
import { lazyChunk } from './dynamic';
import cond from '@scope/cond-pkg';

const name = 'home';
const lazyPage = () => import(`./pages/${name}.ts`);

export function run() {
  return alpha() + beta() + Number(Boolean(cond)) + typeof lazyPage + lazyChunk();
}
