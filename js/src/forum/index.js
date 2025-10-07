import app from 'flarum/forum/app';

const LOG = '[decoration-fix v1]';

/**
 * A) displayName 适配器：
 *    - 渲染阶段保留 user-decoration 的富对象/装饰
 *    - 序列化阶段（JSON.stringify / ''+obj）返回纯字符串，避免环引用
 */
function installDisplayNameAdapter() {
  try {
    const compat = window.flarum?.core?.compat || window.flarum?.compat || {};
    const UserMod = compat['models/User'] || compat['common/models/User'];
    const User = UserMod && (UserMod.default || UserMod);
    if (!User || User.prototype.__lb_df_dn_patched) return;

    const orig = User.prototype.displayName;

    User.prototype.displayName = function () {
      let v;
      try {
        v = orig ? orig.call(this) : (this.username?.() ?? this.attribute?.('username'));
      } catch (e) {}

      // 已是字符串：直接返回
      if (typeof v === 'string') return v;

      // 若是对象（被 user-decoration 包装），为其加 toJSON/toString
      if (v && typeof v === 'object') {
        // 只从原始字段取“纯文本名”；避免再次调用 displayName 造成递归
        const text =
          this.attribute?.('displayName') ||
          this.username?.() ||
          this.attribute?.('username') ||
          '';

        try { Object.defineProperty(v, 'toJSON',  { value: () => text, configurable: true }); }
        catch { v.toJSON  = () => text; }

        if (!v.toString || v.toString === Object.prototype.toString) {
          try { Object.defineProperty(v, 'toString', { value: () => text, configurable: true }); }
          catch { v.toString = () => text; }
        }
      }
      return v;
    };

    User.prototype.__lb_df_dn_patched = true;
    // eslint-disable-next-line no-console
    console.log(LOG, 'displayName adapter installed');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(LOG, 'displayName adapter error, retrying…', e);
    setTimeout(installDisplayNameAdapter, 120);
  }
}

/**
 * B) Typing 兜底：
 *    - 仅在 {event:'client-typing', data:{…}} 被 stringify 时，确保 displayName 为字符串
 *    - 不影响其他 JSON.stringify 用途
 */
function installTypingGuard() {
  if (JSON.stringify.__lb_df_guard) return;
  const _stringify = JSON.stringify;

  const isTypingRoot = (val) =>
    val && typeof val === 'object' &&
    'event' in val && 'data' in val &&
    String(val.event || '').toLowerCase().includes('typing');

  JSON.stringify = function (val, replacer, space) {
    try {
      if (isTypingRoot(val) && replacer === undefined) {
        const data = { ...(val.data || {}) };
        if (typeof data.displayName !== 'string') {
          try {
            // 优先使用对象自带的 toJSON（由上方适配器提供），否则再兜底转字符串
            data.displayName =
              (data.displayName && data.displayName.toJSON && data.displayName.toJSON()) ||
              String(data.displayName || '');
          } catch {
            data.displayName = '';
          }
        }
        return _stringify.call(this, { event: val.event, data }, undefined, space);
      }
    } catch { /* ignore */ }
    return _stringify.call(this, val, replacer, space);
  };
  JSON.stringify.__lb_df_guard = true;
  // eslint-disable-next-line no-console
  console.log(LOG, 'typing guard installed');
}

app.initializers.add('lady-byron-decoration-fix', () => {
  installDisplayNameAdapter();
  installTypingGuard();
});
