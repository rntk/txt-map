import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

function TextPageActionsPortal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const target = document.getElementById('global-menu-portal-target');
  if (!target) return null;
  return createPortal(children, target);
}

export default TextPageActionsPortal;
