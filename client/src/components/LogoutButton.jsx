// Logout button with a confirmation step for intentional sign-outs.
import { useState } from 'react';
import { Modal } from './ui.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function LogoutButton({ className, children }) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  const confirmLogout = () => {
    setOpen(false);
    logout();
  };

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log out?">
        <p className="muted text-sm">Are you sure you want to log out?</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn-primary" onClick={confirmLogout}>Log out</button>
        </div>
      </Modal>
    </>
  );
}
