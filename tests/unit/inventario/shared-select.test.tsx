import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    render(<SharedSelect {...defaultProps} />);

    const trigger = screen.getByLabelText('Test');
    expect(trigger).toBeInTheDocument();

    await userEvent.click(trigger);

    expect(screen.getByText('Opción A')).toBeInTheDocument();
    expect(screen.getByText('Opción B')).toBeInTheDocument();
  });

  it('selecciona el valor por defecto', () => {
    render(<SharedSelect {...defaultProps} defaultValue="A" />);

    const trigger = screen.getByLabelText('Test');
    expect(trigger).toHaveTextContent('A');
  });

  it('llama onChange al seleccionar una opcion', async () => {
    const onChange = vi.fn();
    render(<SharedSelect {...defaultProps} onChange={onChange} />);

    const trigger = screen.getByLabelText('Test');
    await userEvent.click(trigger);

    const opcionB = screen.getByText('Opción B');
    await userEvent.click(opcionB);

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
    render(<SharedSelect {...defaultProps} helper="Ayuda de prueba" />);

    const helperTrigger = screen.getByLabelText('Qué es Test');
    expect(helperTrigger).toBeInTheDocument();

    await userEvent.hover(helperTrigger);
    expect(await screen.findByText('Ayuda de prueba')).toBeInTheDocument();
  });
});