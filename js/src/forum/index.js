// lady-byron/decoration-fix — forum entry
// 逻辑等同于你提供的 <script>：保持装饰返回对象，给其补 toJSON/toString 便于序列化

import app from 'flarum/forum/app';

function installAdapter() {
  try {
    const compat =
      (window.flarum && (window.flarum.core?.compat || window.flarum.compat)) || {};
    const UserMod = compat['models/User'] || compat['common/models/User'];
    const User = UserMod && (UserMod.default || UserMod);

    if (!User) {
      // 初始化时序未就绪，稍后重试
      setTimeout(installAdapter, 120);
      return;
    }

    if (User.prototype.__lb_dn_patched) return;

    const orig = User.prototype.displayName;

    User.prototype.displayName = function () {
      // 先拿到（可能被 user-decoration 改造过的）“富对象”
      let v;
      try {
        v = orig ? orig.call(this) : (this.username?.() ?? this.attribute?.('username'));
      } catch (e) {}

      // 已经是字符串则原样返回
      if (typeof v === 'string') return v;

      // 如果是对象（常见：被 user-decoration 包装）
      if (v && typeof v === 'object') {
        // 取纯文本名用于序列化兜底（避免再次递归 displayName）
        const text =
          this.attribute?.('displayName') ||
          this.username?.() ||
          this.attribute?.('username') ||
          '';

        // 给对象打上 toJSON / toString，JSON.stringify 或 ''+obj 时会用
        try {
          Object.defineProperty(v, 'toJSON', { value: () => text, configurable: true });
        } catch (e) {
          v.toJSON = () => text;
        }

        if (!v.toString || v.toString === Object.prototype.toString) {
          try {
            Object.defineProperty(v, 'toString', { value: () => text, configurable: true });
          } catch (e) {
            v.toString = () => text;
          }
        }
      }

      return v;
    };

    User.prototype.__lb_dn_patched = true;
    // 可选：调试日志
    // console.log('[decoration-fix] displayName adapter installed');
  } catch (e) {
    // 兜底重试（初始化顺序不确定）
    setTimeout(installAdapter, 120);
  }
}

app.initializers.add('lady-byron-decoration-fix', () => {
  // 与页眉脚本一致：只打适配器，不改变其它逻辑
  installAdapter();
});
