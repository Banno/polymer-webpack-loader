import { PolymerElement, html } from '@polymer/polymer/polymer-element.js';
import format from 'date-fns/format';

class MyElement extends PolymerElement {
  static get is() { return 'my-element'; }
  static get properties() {
    return {
      today: {
        type: String,
        value() {
          return format(new Date(), 'MM/DD/YYYY');
        },
      },
    };
  }
  static get template() {
    return html`
<h1>
  Hello, World! It's [[today]].
</h1>
<p><img src="images/hand-waving.png" alt="hand waving"></p>
`;
  }
}

window.customElements.define(MyElement.is, MyElement);
