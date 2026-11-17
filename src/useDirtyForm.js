import { useRef } from 'react';

export function useDirtyForm(values) {
  const currentValues = JSON.stringify(values);
  const initialValues = useRef(currentValues);
  return initialValues.current !== currentValues;
}
