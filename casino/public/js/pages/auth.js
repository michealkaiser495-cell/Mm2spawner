import { state, api, h, money } from '../core.js';

export function renderAuth(view, mode, onDone) {
  const err = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, mode === 'signup' ? 'Create account' : 'Log in');

  const field = (label, attrs) => {
    const input = h('input', attrs);
    return { input, el: h('div', { class: 'field' }, h('label', { for: attrs.id }, label), input) };
  };

  let form;
  if (mode === 'signup') {
    const username = field('Username', { id: 'su-user', type: 'text', autocomplete: 'username', required: true, minlength: 3, maxlength: 20, pattern: '[A-Za-z0-9_]{3,20}' });
    const email = field('Email', { id: 'su-email', type: 'email', autocomplete: 'email', required: true });
    const password = field('Password', { id: 'su-pass', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
    const confirm = field('Confirm password', { id: 'su-pass2', type: 'password', autocomplete: 'new-password', required: true, minlength: 8 });
    const age = h('input', { type: 'checkbox', id: 'su-age', required: true });
    form = h('form', { novalidate: true },
      username.el, email.el, password.el, confirm.el,
      h('div', { class: 'field' }, h('label', { class: 'check', for: 'su-age' }, age, h('span', {}, 'I confirm I am 18 or older and that online gambling is legal where I live.'))),
      err, submit,
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!/^[A-Za-z0-9_]{3,20}$/.test(username.input.value)) return (err.textContent = 'Username must be 3-20 letters, numbers or underscores.');
      if (!email.input.checkValidity() || !email.input.value) return (err.textContent = 'Enter a valid email address.');
      if (password.input.value.length < 8) return (err.textContent = 'Password must be at least 8 characters.');
      if (password.input.value !== confirm.input.value) return (err.textContent = 'Passwords do not match.');
      if (!age.checked) return (err.textContent = 'You must confirm you are 18 or older.');
      submit.disabled = true;
      try {
        const { user } = await api('/auth/signup', {
          method: 'POST',
          body: { username: username.input.value, email: email.input.value, password: password.input.value, ageConfirmed: true },
        });
        state.user = user;
        onDone();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        submit.disabled = false;
      }
    });
  } else {
    const ident = field('Username or email', { id: 'li-user', type: 'text', autocomplete: 'username', required: true });
    const password = field('Password', { id: 'li-pass', type: 'password', autocomplete: 'current-password', required: true });
    form = h('form', { novalidate: true }, ident.el, password.el, err, submit);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!ident.input.value || !password.input.value) return (err.textContent = 'Enter your username/email and password.');
      submit.disabled = true;
      try {
        const { user } = await api('/auth/login', { method: 'POST', body: { identifier: ident.input.value, password: password.input.value } });
        state.user = user;
        onDone();
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        submit.disabled = false;
      }
    });
  }

  const bonus = state.config.signupBonus;
  view.append(h('div', { class: 'auth-wrap' },
    h('section', { class: 'auth-hero' },
      h('h1', {}, 'Six games. Every roll provably fair.'),
      h('p', { class: 'lead' }, 'Dice, Crash, Mines, Blackjack, Plinko and Roulette, with outcomes you can verify yourself. Top up instantly with Stripe.'),
      bonus > 0 ? h('p', { class: 'lead' }, `New accounts get ${money(bonus)} in free play credit.`) : null,
      h('div', { class: 'chips' }, ['🎲 Dice', '🚀 Crash', '💣 Mines', '🃏 Blackjack', '🔻 Plinko', '🎡 Roulette'].map((t) => h('span', { class: 'chip' }, t))),
    ),
    h('section', { class: 'card' },
      h('div', { class: 'tabs' },
        h('button', { type: 'button', class: mode === 'login' ? 'active' : '', onclick: () => { location.hash = '#/login'; } }, 'Log in'),
        h('button', { type: 'button', class: mode === 'signup' ? 'active' : '', onclick: () => { location.hash = '#/signup'; } }, 'Sign up'),
      ),
      form,
    ),
  ));
  form.querySelector('input')?.focus();
}
