import { render, screen } from '@testing-library/react';
import { esperarInteractiva, setupUser } from '../../helpers/user-event';
import { SharedSelect } from '@/components/shared/shared-select';

describe('SharedSelect', () => {
  const defaultProps = {
    name: 'test',
    label: 'Test',
    required: true,
    options: [
      { value: 'A', label: 'Opción A' },
      { value: 'B', label: 'Opción B' },
    ],
  };

  it('renderiza el select con las opciones', async () => {
    const user = setupUser();
    render(<SharedSelect {...defaultProps} />);

    const trigger = screen.getByLabelText('Test');
    expect(trigger).toBeInTheDocument();

    await user.click(trigger);

    expect(screen.getByText('Opción A')).toBeInTheDocument();
    expect(screen.getByText('Opción B')).toBeInTheDocument();
  });

  it('selecciona el valor por defecto', () => {
    render(<SharedSelect {...defaultProps} defaultValue="A" />);

    const trigger = screen.getByLabelText('Test');
    expect(trigger).toHaveTextContent('A');
  });

  it('llama onChange al seleccionar una opcion', async () => {
    const user = setupUser();
    const onChange = vi.fn();
    render(<SharedSelect {...defaultProps} onChange={onChange} />);

    const trigger = screen.getByLabelText('Test');
    await user.click(trigger);

    const opcionB = await screen.findByText('Opción B');
    await user.click(await esperarInteractiva(opcionB));

    expect(onChange).toHaveBeenCalledWith('B');
  });

  it('muestra el error cuando se pasa', () => {
    render(<SharedSelect {...defaultProps} error="Error de prueba" />);

    expect(screen.getByText('Error de prueba')).toBeInTheDocument();
  });

  it('marca el trigger como invalido cuando hay error', () => {
    render(<SharedSelect {...defaultProps} error="Error de prueba" />);

    const trigger = screen.getByLabelText('Test');
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
  });

  it('muestra el helper con tooltip', async () => {
    const user = setupUser();
    render(<SharedSelect {...defaultProps} helper="Ayuda de prueba" />);

    const helperTrigger = screen.getByLabelText('Qué es Test');
    expect(helperTrigger).toBeInTheDocument();

    await user.hover(helperTrigger);
    expect(await screen.findByText('Ayuda de prueba')).toBeInTheDocument();
  });
});
