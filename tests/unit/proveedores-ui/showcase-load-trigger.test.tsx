import { cleanup, render } from '@testing-library/react';
import {
  mockAllIsIntersecting,
  resetIntersectionMocking,
  setupIntersectionMocking,
} from 'react-intersection-observer/test-utils';

import { ShowcaseLoadTrigger } from '@/app/(private)/proveedores/components';

beforeAll(() => {
  setupIntersectionMocking(vi.fn);
});

afterEach(() => {
  cleanup();
  resetIntersectionMocking();
});

describe('ShowcaseLoadTrigger', () => {
  it('pinta el centinela sin contenido visible', () => {
    const { getByTestId } = render(<ShowcaseLoadTrigger onVisible={vi.fn()} />);

    const centinela = getByTestId('showcase-load-trigger');
    expect(centinela).toBeInTheDocument();
    expect(centinela).toHaveAttribute('aria-hidden', 'true');
  });

  it('R12, R18 — llama a onVisible cuando el centinela entra en vista', () => {
    const onVisible = vi.fn();
    render(<ShowcaseLoadTrigger onVisible={onVisible} />);

    mockAllIsIntersecting(true);

    expect(onVisible).toHaveBeenCalledTimes(1);
  });

  it('no llama a onVisible mientras el centinela sigue fuera de vista', () => {
    const onVisible = vi.fn();
    render(<ShowcaseLoadTrigger onVisible={onVisible} />);

    mockAllIsIntersecting(false);

    expect(onVisible).not.toHaveBeenCalled();
  });

  it('R14 — deshabilitado, no llama a onVisible aunque el centinela entre en vista', () => {
    const onVisible = vi.fn();
    render(<ShowcaseLoadTrigger onVisible={onVisible} disabled />);

    mockAllIsIntersecting(true);

    expect(onVisible).not.toHaveBeenCalled();
  });
});
