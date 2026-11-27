import{x as D,o as H,A as N,O as q,i as L,e as P,a as Ke,y as u,E as F,R as B,u as U,G as Vt,V as ye,F as ge,X as Hn,v as J,z as me,T as Bt,d as De,M as Tn,Y as _n,Z as In,m as Wn,Q as Oe,C as fe,_ as Gn,$ as Qn,P as Kt,I as An,a0 as Pt}from"./core-CUPqGwIX.js";import{n as d,r as _,c as O,o as j,U as ce,i as Jn,t as Yn,e as Xn}from"./index-CKS6qrEE.js";import{a as Zn}from"./react-PSu279jq.js";import{am as ei,an as ti}from"./CryptoWalletConnectionHandler-B2RMvXLD.js";import"./index-Dq-2S7SG.js";import"./solana-DVcQ8cJ0.js";import"./charts-F0ZZ7xY9.js";var Be=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let ve=class extends D{constructor(){super(),this.unsubscribe=[],this.tabIdx=void 0,this.connectors=H.state.connectors,this.count=N.state.count,this.filteredCount=N.state.filteredWallets.length,this.isFetchingRecommendedWallets=N.state.isFetchingRecommendedWallets,this.unsubscribe.push(H.subscribeKey("connectors",t=>this.connectors=t),N.subscribeKey("count",t=>this.count=t),N.subscribeKey("filteredWallets",t=>this.filteredCount=t.length),N.subscribeKey("isFetchingRecommendedWallets",t=>this.isFetchingRecommendedWallets=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=this.connectors.find(c=>c.id==="walletConnect"),{allWallets:i}=q.state;if(!t||i==="HIDE"||i==="ONLY_MOBILE"&&!L.isMobile())return null;const r=N.state.featured.length,o=this.count+r,n=o<10?o:Math.floor(o/10)*10,s=this.filteredCount>0?this.filteredCount:n;let a=`${s}`;this.filteredCount>0?a=`${this.filteredCount}`:s<o&&(a=`${s}+`);const l=P.hasAnyConnection(Ke.CONNECTOR_ID.WALLET_CONNECT);return u`
      <wui-list-wallet
        name="Search Wallet"
        walletIcon="search"
        showAllWallets
        @click=${this.onAllWallets.bind(this)}
        tagLabel=${a}
        tagVariant="info"
        data-testid="all-wallets"
        tabIdx=${j(this.tabIdx)}
        .loading=${this.isFetchingRecommendedWallets}
        ?disabled=${l}
        size="sm"
      ></wui-list-wallet>
    `}onAllWallets(){F.sendEvent({type:"track",event:"CLICK_ALL_WALLETS"}),B.push("AllWallets",{redirectView:B.state.data?.redirectView})}};Be([d()],ve.prototype,"tabIdx",void 0);Be([_()],ve.prototype,"connectors",void 0);Be([_()],ve.prototype,"count",void 0);Be([_()],ve.prototype,"filteredCount",void 0);Be([_()],ve.prototype,"isFetchingRecommendedWallets",void 0);ve=Be([O("w3m-all-wallets-widget")],ve);const ni=U`
  :host {
    margin-top: ${({spacing:e})=>e[1]};
  }
  wui-separator {
    margin: ${({spacing:e})=>e[3]} calc(${({spacing:e})=>e[3]} * -1)
      ${({spacing:e})=>e[2]} calc(${({spacing:e})=>e[3]} * -1);
    width: calc(100% + ${({spacing:e})=>e[3]} * 2);
  }
`;var de=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Z=class extends D{constructor(){super(),this.unsubscribe=[],this.connectors=H.state.connectors,this.recommended=N.state.recommended,this.featured=N.state.featured,this.explorerWallets=N.state.explorerWallets,this.connections=P.state.connections,this.connectorImages=Vt.state.connectorImages,this.loadingTelegram=!1,this.unsubscribe.push(H.subscribeKey("connectors",t=>this.connectors=t),P.subscribeKey("connections",t=>this.connections=t),Vt.subscribeKey("connectorImages",t=>this.connectorImages=t),N.subscribeKey("recommended",t=>this.recommended=t),N.subscribeKey("featured",t=>this.featured=t),N.subscribeKey("explorerFilteredWallets",t=>{this.explorerWallets=t?.length?t:N.state.explorerWallets}),N.subscribeKey("explorerWallets",t=>{this.explorerWallets?.length||(this.explorerWallets=t)})),L.isTelegram()&&L.isIos()&&(this.loadingTelegram=!P.state.wcUri,this.unsubscribe.push(P.subscribeKey("wcUri",t=>this.loadingTelegram=!t)))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return u`
      <wui-flex flexDirection="column" gap="2"> ${this.connectorListTemplate()} </wui-flex>
    `}mapConnectorsToExplorerWallets(t,i){return t.map(r=>{if(r.type==="MULTI_CHAIN"&&r.connectors){const n=r.connectors.map(c=>c.id),s=r.connectors.map(c=>c.name),a=r.connectors.map(c=>c.info?.rdns),l=i?.find(c=>n.includes(c.id)||s.includes(c.name)||c.rdns&&(a.includes(c.rdns)||n.includes(c.rdns)));return r.explorerWallet=l??r.explorerWallet,r}const o=i?.find(n=>n.id===r.id||n.rdns===r.info?.rdns||n.name===r.name);return r.explorerWallet=o??r.explorerWallet,r})}processConnectorsByType(t,i=!0){const r=ye.sortConnectorsByExplorerWallet([...t]);return i?r.filter(ye.showConnector):r}connectorListTemplate(){const t=this.mapConnectorsToExplorerWallets(this.connectors,this.explorerWallets??[]),i=ye.getConnectorsByType(t,this.recommended,this.featured),r=this.processConnectorsByType(i.announced.filter(h=>h.id!=="walletConnect")),o=this.processConnectorsByType(i.injected),n=this.processConnectorsByType(i.multiChain.filter(h=>h.name!=="WalletConnect"),!1),s=i.custom,a=i.recent,l=this.processConnectorsByType(i.external.filter(h=>h.id!==Ke.CONNECTOR_ID.COINBASE_SDK)),c=i.recommended,w=i.featured,E=ye.getConnectorTypeOrder({custom:s,recent:a,announced:r,injected:o,multiChain:n,recommended:c,featured:w,external:l}),C=this.connectors.find(h=>h.id==="walletConnect"),m=L.isMobile(),x=[];for(const h of E)switch(h){case"walletConnect":{!m&&C&&x.push({kind:"connector",subtype:"walletConnect",connector:C});break}case"recent":{ye.getFilteredRecentWallets().forEach(p=>x.push({kind:"wallet",subtype:"recent",wallet:p}));break}case"injected":{n.forEach(b=>x.push({kind:"connector",subtype:"multiChain",connector:b})),r.forEach(b=>x.push({kind:"connector",subtype:"announced",connector:b})),o.forEach(b=>x.push({kind:"connector",subtype:"injected",connector:b}));break}case"featured":{w.forEach(b=>x.push({kind:"wallet",subtype:"featured",wallet:b}));break}case"custom":{ye.getFilteredCustomWallets(s??[]).forEach(p=>x.push({kind:"wallet",subtype:"custom",wallet:p}));break}case"external":{l.forEach(b=>x.push({kind:"connector",subtype:"external",connector:b}));break}case"recommended":{ye.getCappedRecommendedWallets(c).forEach(p=>x.push({kind:"wallet",subtype:"recommended",wallet:p}));break}default:console.warn(`Unknown connector type: ${h}`)}return x.map((h,b)=>h.kind==="connector"?this.renderConnector(h,b):this.renderWallet(h,b))}renderConnector(t,i){const r=t.connector,o=ge.getConnectorImage(r)||this.connectorImages[r?.imageId??""],s=(this.connections.get(r.chain)??[]).some(E=>Hn.isLowerCaseMatch(E.connectorId,r.id));let a,l;t.subtype==="multiChain"?(a="multichain",l="info"):t.subtype==="walletConnect"?(a="qr code",l="accent"):t.subtype==="injected"||t.subtype==="announced"?(a=s?"connected":"installed",l=s?"info":"success"):(a=void 0,l=void 0);const c=P.hasAnyConnection(Ke.CONNECTOR_ID.WALLET_CONNECT),w=t.subtype==="walletConnect"||t.subtype==="external"?c:!1;return u`
      <w3m-list-wallet
        displayIndex=${i}
        imageSrc=${j(o)}
        .installed=${!0}
        name=${r.name??"Unknown"}
        .tagVariant=${l}
        tagLabel=${j(a)}
        data-testid=${`wallet-selector-${r.id.toLowerCase()}`}
        size="sm"
        @click=${()=>this.onClickConnector(t)}
        tabIdx=${j(this.tabIdx)}
        ?disabled=${w}
        rdnsId=${j(r.explorerWallet?.rdns||void 0)}
        walletRank=${j(r.explorerWallet?.order)}
      >
      </w3m-list-wallet>
    `}onClickConnector(t){const i=B.state.data?.redirectView;if(t.subtype==="walletConnect"){H.setActiveConnector(t.connector),L.isMobile()?B.push("AllWallets"):B.push("ConnectingWalletConnect",{redirectView:i});return}if(t.subtype==="multiChain"){H.setActiveConnector(t.connector),B.push("ConnectingMultiChain",{redirectView:i});return}if(t.subtype==="injected"){H.setActiveConnector(t.connector),B.push("ConnectingExternal",{connector:t.connector,redirectView:i,wallet:t.connector.explorerWallet});return}if(t.subtype==="announced"){if(t.connector.id==="walletConnect"){L.isMobile()?B.push("AllWallets"):B.push("ConnectingWalletConnect",{redirectView:i});return}B.push("ConnectingExternal",{connector:t.connector,redirectView:i,wallet:t.connector.explorerWallet});return}B.push("ConnectingExternal",{connector:t.connector,redirectView:i})}renderWallet(t,i){const r=t.wallet,o=ge.getWalletImage(r),s=P.hasAnyConnection(Ke.CONNECTOR_ID.WALLET_CONNECT),a=this.loadingTelegram,l=t.subtype==="recent"?"recent":void 0,c=t.subtype==="recent"?"info":void 0;return u`
      <w3m-list-wallet
        displayIndex=${i}
        imageSrc=${j(o)}
        name=${r.name??"Unknown"}
        @click=${()=>this.onClickWallet(t)}
        size="sm"
        data-testid=${`wallet-selector-${r.id}`}
        tabIdx=${j(this.tabIdx)}
        ?loading=${a}
        ?disabled=${s}
        rdnsId=${j(r.rdns||void 0)}
        walletRank=${j(r.order)}
        tagLabel=${j(l)}
        .tagVariant=${c}
      >
      </w3m-list-wallet>
    `}onClickWallet(t){const i=B.state.data?.redirectView;if(t.subtype==="featured"){H.selectWalletConnector(t.wallet);return}if(t.subtype==="recent"){if(this.loadingTelegram)return;H.selectWalletConnector(t.wallet);return}if(t.subtype==="custom"){if(this.loadingTelegram)return;B.push("ConnectingWalletConnect",{wallet:t.wallet,redirectView:i});return}if(this.loadingTelegram)return;const r=H.getConnector({id:t.wallet.id,rdns:t.wallet.rdns});r?B.push("ConnectingExternal",{connector:r,redirectView:i}):B.push("ConnectingWalletConnect",{wallet:t.wallet,redirectView:i})}};Z.styles=ni;de([d({type:Number})],Z.prototype,"tabIdx",void 0);de([_()],Z.prototype,"connectors",void 0);de([_()],Z.prototype,"recommended",void 0);de([_()],Z.prototype,"featured",void 0);de([_()],Z.prototype,"explorerWallets",void 0);de([_()],Z.prototype,"connections",void 0);de([_()],Z.prototype,"connectorImages",void 0);de([_()],Z.prototype,"loadingTelegram",void 0);Z=de([O("w3m-connector-list")],Z);const ii=U`
  :host {
    flex: 1;
    height: 100%;
  }

  button {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    padding: ${({spacing:e})=>e[1]} ${({spacing:e})=>e[2]};
    column-gap: ${({spacing:e})=>e[1]};
    color: ${({tokens:e})=>e.theme.textSecondary};
    border-radius: ${({borderRadius:e})=>e[20]};
    background-color: transparent;
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
  }

  /* -- Hover & Active states ----------------------------------------------------------- */
  button[data-active='true'] {
    color: ${({tokens:e})=>e.theme.textPrimary};
    background-color: ${({tokens:e})=>e.theme.foregroundTertiary};
  }

  button:hover:enabled:not([data-active='true']),
  button:active:enabled:not([data-active='true']) {
    wui-text,
    wui-icon {
      color: ${({tokens:e})=>e.theme.textPrimary};
    }
  }
`;var je=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};const ri={lg:"lg-regular",md:"md-regular",sm:"sm-regular"},oi={lg:"md",md:"sm",sm:"sm"};let $e=class extends D{constructor(){super(...arguments),this.icon="mobile",this.size="md",this.label="",this.active=!1}render(){return u`
      <button data-active=${this.active}>
        ${this.icon?u`<wui-icon size=${oi[this.size]} name=${this.icon}></wui-icon>`:""}
        <wui-text variant=${ri[this.size]}> ${this.label} </wui-text>
      </button>
    `}};$e.styles=[J,me,ii];je([d()],$e.prototype,"icon",void 0);je([d()],$e.prototype,"size",void 0);je([d()],$e.prototype,"label",void 0);je([d({type:Boolean})],$e.prototype,"active",void 0);$e=je([O("wui-tab-item")],$e);const si=U`
  :host {
    display: inline-flex;
    align-items: center;
    background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    border-radius: ${({borderRadius:e})=>e[32]};
    padding: ${({spacing:e})=>e["01"]};
    box-sizing: border-box;
  }

  :host([data-size='sm']) {
    height: 26px;
  }

  :host([data-size='md']) {
    height: 36px;
  }
`;var Ue=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ce=class extends D{constructor(){super(...arguments),this.tabs=[],this.onTabChange=()=>null,this.size="md",this.activeTab=0}render(){return this.dataset.size=this.size,this.tabs.map((t,i)=>{const r=i===this.activeTab;return u`
        <wui-tab-item
          @click=${()=>this.onTabClick(i)}
          icon=${t.icon}
          size=${this.size}
          label=${t.label}
          ?active=${r}
          data-active=${r}
          data-testid="tab-${t.label?.toLowerCase()}"
        ></wui-tab-item>
      `})}onTabClick(t){this.activeTab=t,this.onTabChange(t)}};Ce.styles=[J,me,si];Ue([d({type:Array})],Ce.prototype,"tabs",void 0);Ue([d()],Ce.prototype,"onTabChange",void 0);Ue([d()],Ce.prototype,"size",void 0);Ue([_()],Ce.prototype,"activeTab",void 0);Ce=Ue([O("wui-tabs")],Ce);var Nt=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let He=class extends D{constructor(){super(...arguments),this.platformTabs=[],this.unsubscribe=[],this.platforms=[],this.onSelectPlatfrom=void 0}disconnectCallback(){this.unsubscribe.forEach(t=>t())}render(){const t=this.generateTabs();return u`
      <wui-flex justifyContent="center" .padding=${["0","0","4","0"]}>
        <wui-tabs .tabs=${t} .onTabChange=${this.onTabChange.bind(this)}></wui-tabs>
      </wui-flex>
    `}generateTabs(){const t=this.platforms.map(i=>i==="browser"?{label:"Browser",icon:"extension",platform:"browser"}:i==="mobile"?{label:"Mobile",icon:"mobile",platform:"mobile"}:i==="qrcode"?{label:"Mobile",icon:"mobile",platform:"qrcode"}:i==="web"?{label:"Webapp",icon:"browser",platform:"web"}:i==="desktop"?{label:"Desktop",icon:"desktop",platform:"desktop"}:{label:"Browser",icon:"extension",platform:"unsupported"});return this.platformTabs=t.map(({platform:i})=>i),t}onTabChange(t){const i=this.platformTabs[t];i&&this.onSelectPlatfrom?.(i)}};Nt([d({type:Array})],He.prototype,"platforms",void 0);Nt([d()],He.prototype,"onSelectPlatfrom",void 0);He=Nt([O("w3m-connecting-header")],He);const ai=U`
  :host {
    display: block;
    width: 100px;
    height: 100px;
  }

  svg {
    width: 100px;
    height: 100px;
  }

  rect {
    fill: none;
    stroke: ${e=>e.colors.accent100};
    stroke-width: 3px;
    stroke-linecap: round;
    animation: dash 1s linear infinite;
  }

  @keyframes dash {
    to {
      stroke-dashoffset: 0px;
    }
  }
`;var kn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ge=class extends D{constructor(){super(...arguments),this.radius=36}render(){return this.svgLoaderTemplate()}svgLoaderTemplate(){const t=this.radius>50?50:this.radius,r=36-t,o=116+r,n=245+r,s=360+r*1.75;return u`
      <svg viewBox="0 0 110 110" width="110" height="110">
        <rect
          x="2"
          y="2"
          width="106"
          height="106"
          rx=${t}
          stroke-dasharray="${o} ${n}"
          stroke-dashoffset=${s}
        />
      </svg>
    `}};Ge.styles=[J,ai];kn([d({type:Number})],Ge.prototype,"radius",void 0);Ge=kn([O("wui-loading-thumbnail")],Ge);const li=U`
  wui-flex {
    width: 100%;
    height: 52px;
    box-sizing: border-box;
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[5]};
    padding-left: ${({spacing:e})=>e[3]};
    padding-right: ${({spacing:e})=>e[3]};
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${({spacing:e})=>e[6]};
  }

  wui-text {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  wui-icon {
    width: 12px;
    height: 12px;
  }
`;var it=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ae=class extends D{constructor(){super(...arguments),this.disabled=!1,this.label="",this.buttonLabel=""}render(){return u`
      <wui-flex justifyContent="space-between" alignItems="center">
        <wui-text variant="lg-regular" color="inherit">${this.label}</wui-text>
        <wui-button variant="accent-secondary" size="sm">
          ${this.buttonLabel}
          <wui-icon name="chevronRight" color="inherit" size="inherit" slot="iconRight"></wui-icon>
        </wui-button>
      </wui-flex>
    `}};Ae.styles=[J,me,li];it([d({type:Boolean})],Ae.prototype,"disabled",void 0);it([d()],Ae.prototype,"label",void 0);it([d()],Ae.prototype,"buttonLabel",void 0);Ae=it([O("wui-cta-button")],Ae);const ci=U`
  :host {
    display: block;
    padding: 0 ${({spacing:e})=>e[5]} ${({spacing:e})=>e[5]};
  }
`;var Bn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Qe=class extends D{constructor(){super(...arguments),this.wallet=void 0}render(){if(!this.wallet)return this.style.display="none",null;const{name:t,app_store:i,play_store:r,chrome_store:o,homepage:n}=this.wallet,s=L.isMobile(),a=L.isIos(),l=L.isAndroid(),c=[i,r,n,o].filter(Boolean).length>1,w=ce.getTruncateString({string:t,charsStart:12,charsEnd:0,truncate:"end"});return c&&!s?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${()=>B.push("Downloads",{wallet:this.wallet})}
        ></wui-cta-button>
      `:!c&&n?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onHomePage.bind(this)}
        ></wui-cta-button>
      `:i&&a?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onAppStore.bind(this)}
        ></wui-cta-button>
      `:r&&l?u`
        <wui-cta-button
          label=${`Don't have ${w}?`}
          buttonLabel="Get"
          @click=${this.onPlayStore.bind(this)}
        ></wui-cta-button>
      `:(this.style.display="none",null)}onAppStore(){this.wallet?.app_store&&L.openHref(this.wallet.app_store,"_blank")}onPlayStore(){this.wallet?.play_store&&L.openHref(this.wallet.play_store,"_blank")}onHomePage(){this.wallet?.homepage&&L.openHref(this.wallet.homepage,"_blank")}};Qe.styles=[ci];Bn([d({type:Object})],Qe.prototype,"wallet",void 0);Qe=Bn([O("w3m-mobile-download-links")],Qe);const ui=U`
  @keyframes shake {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(3px);
    }
    50% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
    100% {
      transform: translateX(0);
    }
  }

  wui-flex:first-child:not(:only-child) {
    position: relative;
  }

  wui-wallet-image {
    width: 56px;
    height: 56px;
  }

  wui-loading-thumbnail {
    position: absolute;
  }

  wui-icon-box {
    position: absolute;
    right: calc(${({spacing:e})=>e[1]} * -1);
    bottom: calc(${({spacing:e})=>e[1]} * -1);
    opacity: 0;
    transform: scale(0.5);
    transition-property: opacity, transform;
    transition-duration: ${({durations:e})=>e.lg};
    transition-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    will-change: opacity, transform;
  }

  wui-text[align='center'] {
    width: 100%;
    padding: 0px ${({spacing:e})=>e[4]};
  }

  [data-error='true'] wui-icon-box {
    opacity: 1;
    transform: scale(1);
  }

  [data-error='true'] > wui-flex:first-child {
    animation: shake 250ms ${({easings:e})=>e["ease-out-power-2"]} both;
  }

  [data-retry='false'] wui-link {
    display: none;
  }

  [data-retry='true'] wui-link {
    display: block;
    opacity: 1;
  }

  w3m-mobile-download-links {
    padding: 0px;
    width: 100%;
  }
`;var ee=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};class z extends D{constructor(){super(),this.wallet=B.state.data?.wallet,this.connector=B.state.data?.connector,this.timeout=void 0,this.secondaryBtnIcon="refresh",this.onConnect=void 0,this.onRender=void 0,this.onAutoConnect=void 0,this.isWalletConnect=!0,this.unsubscribe=[],this.imageSrc=ge.getConnectorImage(this.connector)??ge.getWalletImage(this.wallet),this.name=this.wallet?.name??this.connector?.name??"Wallet",this.isRetrying=!1,this.uri=P.state.wcUri,this.error=P.state.wcError,this.ready=!1,this.showRetry=!1,this.label=void 0,this.secondaryBtnLabel="Try again",this.secondaryLabel="Accept connection request in the wallet",this.isLoading=!1,this.isMobile=!1,this.onRetry=void 0,this.unsubscribe.push(P.subscribeKey("wcUri",t=>{this.uri=t,this.isRetrying&&this.onRetry&&(this.isRetrying=!1,this.onConnect?.())}),P.subscribeKey("wcError",t=>this.error=t)),(L.isTelegram()||L.isSafari())&&L.isIos()&&P.state.wcUri&&this.onConnect?.()}firstUpdated(){this.onAutoConnect?.(),this.showRetry=!this.onAutoConnect}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),P.setWcError(!1),clearTimeout(this.timeout)}render(){this.onRender?.(),this.onShowRetry();const t=this.error?"Connection can be declined if a previous request is still active":this.secondaryLabel;let i="";return this.label?i=this.label:(i=`Continue in ${this.name}`,this.error&&(i="Connection declined")),u`
      <wui-flex
        data-error=${j(this.error)}
        data-retry=${this.showRetry}
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="6"
      >
        <wui-flex gap="2" justifyContent="center" alignItems="center">
          <wui-wallet-image size="lg" imageSrc=${j(this.imageSrc)}></wui-wallet-image>

          ${this.error?null:this.loaderTemplate()}

          <wui-icon-box
            color="error"
            icon="close"
            size="sm"
            border
            borderColor="wui-color-bg-125"
          ></wui-icon-box>
        </wui-flex>

        <wui-flex flexDirection="column" alignItems="center" gap="6"> <wui-flex
          flexDirection="column"
          alignItems="center"
          gap="2"
          .padding=${["2","0","0","0"]}
        >
          <wui-text align="center" variant="lg-medium" color=${this.error?"error":"primary"}>
            ${i}
          </wui-text>
          <wui-text align="center" variant="lg-regular" color="secondary">${t}</wui-text>
        </wui-flex>

        ${this.secondaryBtnLabel?u`
                <wui-button
                  variant="neutral-secondary"
                  size="md"
                  ?disabled=${this.isRetrying||this.isLoading}
                  @click=${this.onTryAgain.bind(this)}
                  data-testid="w3m-connecting-widget-secondary-button"
                >
                  <wui-icon
                    color="inherit"
                    slot="iconLeft"
                    name=${this.secondaryBtnIcon}
                  ></wui-icon>
                  ${this.secondaryBtnLabel}
                </wui-button>
              `:null}
      </wui-flex>

      ${this.isWalletConnect?u`
              <wui-flex .padding=${["0","5","5","5"]} justifyContent="center">
                <wui-link
                  @click=${this.onCopyUri}
                  variant="secondary"
                  icon="copy"
                  data-testid="wui-link-copy"
                >
                  Copy link
                </wui-link>
              </wui-flex>
            `:null}

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links></wui-flex>
      </wui-flex>
    `}onShowRetry(){this.error&&!this.showRetry&&(this.showRetry=!0,this.shadowRoot?.querySelector("wui-button")?.animate([{opacity:0},{opacity:1}],{fill:"forwards",easing:"ease"}))}onTryAgain(){P.setWcError(!1),this.onRetry?(this.isRetrying=!0,this.onRetry?.()):this.onConnect?.()}loaderTemplate(){const t=Bt.state.themeVariables["--w3m-border-radius-master"],i=t?parseInt(t.replace("px",""),10):4;return u`<wui-loading-thumbnail radius=${i*9}></wui-loading-thumbnail>`}onCopyUri(){try{this.uri&&(L.copyToClopboard(this.uri),De.showSuccess("Link copied"))}catch{De.showError("Failed to copy")}}}z.styles=ui;ee([_()],z.prototype,"isRetrying",void 0);ee([_()],z.prototype,"uri",void 0);ee([_()],z.prototype,"error",void 0);ee([_()],z.prototype,"ready",void 0);ee([_()],z.prototype,"showRetry",void 0);ee([_()],z.prototype,"label",void 0);ee([_()],z.prototype,"secondaryBtnLabel",void 0);ee([_()],z.prototype,"secondaryLabel",void 0);ee([_()],z.prototype,"isLoading",void 0);ee([d({type:Boolean})],z.prototype,"isMobile",void 0);ee([d()],z.prototype,"onRetry",void 0);var di=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ht=class extends z{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-browser: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onAutoConnect=this.onConnectProxy.bind(this),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:B.state.view}})}async onConnectProxy(){try{this.error=!1;const{connectors:t}=H.state,i=t.find(r=>r.type==="ANNOUNCED"&&r.info?.rdns===this.wallet?.rdns||r.type==="INJECTED"||r.name===this.wallet?.name);if(i)await P.connectExternal(i,i.chain);else throw new Error("w3m-connecting-wc-browser: No connector found");Tn.close(),F.sendEvent({type:"track",event:"CONNECT_SUCCESS",properties:{method:"browser",name:this.wallet?.name||"Unknown",view:B.state.view,walletRank:this.wallet?.order}})}catch(t){t instanceof _n&&t.originalName===In.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?F.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:t.message}}):F.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:t?.message??"Unknown"}}),this.error=!0}}};Ht=di([O("w3m-connecting-wc-browser")],Ht);var hi=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Gt=class extends z{constructor(){if(super(),!this.wallet)throw new Error("w3m-connecting-wc-desktop: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.onRender=this.onRenderProxy.bind(this),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"desktop",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:B.state.view}})}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onConnectProxy(){if(this.wallet?.desktop_link&&this.uri)try{this.error=!1;const{desktop_link:t,name:i}=this.wallet,{redirect:r,href:o}=L.formatNativeUrl(t,this.uri);P.setWcLinking({name:i,href:o}),P.setRecentWallet(this.wallet),L.openHref(r,"_blank")}catch{this.error=!0}}};Gt=hi([O("w3m-connecting-wc-desktop")],Gt);var Pe=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let xe=class extends z{constructor(){if(super(),this.btnLabelTimeout=void 0,this.redirectDeeplink=void 0,this.redirectUniversalLink=void 0,this.target=void 0,this.preferUniversalLinks=q.state.experimental_preferUniversalLinks,this.isLoading=!0,this.onConnect=()=>{if(this.wallet?.mobile_link&&this.uri)try{this.error=!1;const{mobile_link:t,link_mode:i,name:r}=this.wallet,{redirect:o,redirectUniversalLink:n,href:s}=L.formatNativeUrl(t,this.uri,i);this.redirectDeeplink=o,this.redirectUniversalLink=n,this.target=L.isIframe()?"_top":"_self",P.setWcLinking({name:r,href:s}),P.setRecentWallet(this.wallet),this.preferUniversalLinks&&this.redirectUniversalLink?L.openHref(this.redirectUniversalLink,this.target):L.openHref(this.redirectDeeplink,this.target)}catch(t){F.sendEvent({type:"track",event:"CONNECT_PROXY_ERROR",properties:{message:t instanceof Error?t.message:"Error parsing the deeplink",uri:this.uri,mobile_link:this.wallet.mobile_link,name:this.wallet.name}}),this.error=!0}},!this.wallet)throw new Error("w3m-connecting-wc-mobile: No wallet provided");this.secondaryBtnLabel="Open",this.secondaryLabel=Wn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.onHandleURI(),this.unsubscribe.push(P.subscribeKey("wcUri",()=>{this.onHandleURI()})),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"mobile",displayIndex:this.wallet?.display_index,walletRank:this.wallet.order,view:B.state.view}})}disconnectedCallback(){super.disconnectedCallback(),clearTimeout(this.btnLabelTimeout)}onHandleURI(){this.isLoading=!this.uri,!this.ready&&this.uri&&(this.ready=!0,this.onConnect?.())}onTryAgain(){P.setWcError(!1),this.onConnect?.()}};Pe([_()],xe.prototype,"redirectDeeplink",void 0);Pe([_()],xe.prototype,"redirectUniversalLink",void 0);Pe([_()],xe.prototype,"target",void 0);Pe([_()],xe.prototype,"preferUniversalLinks",void 0);Pe([_()],xe.prototype,"isLoading",void 0);xe=Pe([O("w3m-connecting-wc-mobile")],xe);var We={},ct,Qt;function fi(){return Qt||(Qt=1,ct=function(){return typeof Promise=="function"&&Promise.prototype&&Promise.prototype.then}),ct}var ut={},pe={},Jt;function Se(){if(Jt)return pe;Jt=1;let e;const t=[0,26,44,70,100,134,172,196,242,292,346,404,466,532,581,655,733,815,901,991,1085,1156,1258,1364,1474,1588,1706,1828,1921,2051,2185,2323,2465,2611,2761,2876,3034,3196,3362,3532,3706];return pe.getSymbolSize=function(r){if(!r)throw new Error('"version" cannot be null or undefined');if(r<1||r>40)throw new Error('"version" should be in range from 1 to 40');return r*4+17},pe.getSymbolTotalCodewords=function(r){return t[r]},pe.getBCHDigit=function(i){let r=0;for(;i!==0;)r++,i>>>=1;return r},pe.setToSJISFunction=function(r){if(typeof r!="function")throw new Error('"toSJISFunc" is not a valid function.');e=r},pe.isKanjiModeEnabled=function(){return typeof e<"u"},pe.toSJIS=function(r){return e(r)},pe}var dt={},Yt;function Ot(){return Yt||(Yt=1,(function(e){e.L={bit:1},e.M={bit:0},e.Q={bit:3},e.H={bit:2};function t(i){if(typeof i!="string")throw new Error("Param is not a string");switch(i.toLowerCase()){case"l":case"low":return e.L;case"m":case"medium":return e.M;case"q":case"quartile":return e.Q;case"h":case"high":return e.H;default:throw new Error("Unknown EC Level: "+i)}}e.isValid=function(r){return r&&typeof r.bit<"u"&&r.bit>=0&&r.bit<4},e.from=function(r,o){if(e.isValid(r))return r;try{return t(r)}catch{return o}}})(dt)),dt}var ht,Xt;function pi(){if(Xt)return ht;Xt=1;function e(){this.buffer=[],this.length=0}return e.prototype={get:function(t){const i=Math.floor(t/8);return(this.buffer[i]>>>7-t%8&1)===1},put:function(t,i){for(let r=0;r<i;r++)this.putBit((t>>>i-r-1&1)===1)},getLengthInBits:function(){return this.length},putBit:function(t){const i=Math.floor(this.length/8);this.buffer.length<=i&&this.buffer.push(0),t&&(this.buffer[i]|=128>>>this.length%8),this.length++}},ht=e,ht}var ft,Zt;function gi(){if(Zt)return ft;Zt=1;function e(t){if(!t||t<1)throw new Error("BitMatrix size must be defined and greater than 0");this.size=t,this.data=new Uint8Array(t*t),this.reservedBit=new Uint8Array(t*t)}return e.prototype.set=function(t,i,r,o){const n=t*this.size+i;this.data[n]=r,o&&(this.reservedBit[n]=!0)},e.prototype.get=function(t,i){return this.data[t*this.size+i]},e.prototype.xor=function(t,i,r){this.data[t*this.size+i]^=r},e.prototype.isReserved=function(t,i){return this.reservedBit[t*this.size+i]},ft=e,ft}var pt={},en;function mi(){return en||(en=1,(function(e){const t=Se().getSymbolSize;e.getRowColCoords=function(r){if(r===1)return[];const o=Math.floor(r/7)+2,n=t(r),s=n===145?26:Math.ceil((n-13)/(2*o-2))*2,a=[n-7];for(let l=1;l<o-1;l++)a[l]=a[l-1]-s;return a.push(6),a.reverse()},e.getPositions=function(r){const o=[],n=e.getRowColCoords(r),s=n.length;for(let a=0;a<s;a++)for(let l=0;l<s;l++)a===0&&l===0||a===0&&l===s-1||a===s-1&&l===0||o.push([n[a],n[l]]);return o}})(pt)),pt}var gt={},tn;function wi(){if(tn)return gt;tn=1;const e=Se().getSymbolSize,t=7;return gt.getPositions=function(r){const o=e(r);return[[0,0],[o-t,0],[0,o-t]]},gt}var mt={},nn;function bi(){return nn||(nn=1,(function(e){e.Patterns={PATTERN000:0,PATTERN001:1,PATTERN010:2,PATTERN011:3,PATTERN100:4,PATTERN101:5,PATTERN110:6,PATTERN111:7};const t={N1:3,N2:3,N3:40,N4:10};e.isValid=function(o){return o!=null&&o!==""&&!isNaN(o)&&o>=0&&o<=7},e.from=function(o){return e.isValid(o)?parseInt(o,10):void 0},e.getPenaltyN1=function(o){const n=o.size;let s=0,a=0,l=0,c=null,w=null;for(let E=0;E<n;E++){a=l=0,c=w=null;for(let C=0;C<n;C++){let m=o.get(E,C);m===c?a++:(a>=5&&(s+=t.N1+(a-5)),c=m,a=1),m=o.get(C,E),m===w?l++:(l>=5&&(s+=t.N1+(l-5)),w=m,l=1)}a>=5&&(s+=t.N1+(a-5)),l>=5&&(s+=t.N1+(l-5))}return s},e.getPenaltyN2=function(o){const n=o.size;let s=0;for(let a=0;a<n-1;a++)for(let l=0;l<n-1;l++){const c=o.get(a,l)+o.get(a,l+1)+o.get(a+1,l)+o.get(a+1,l+1);(c===4||c===0)&&s++}return s*t.N2},e.getPenaltyN3=function(o){const n=o.size;let s=0,a=0,l=0;for(let c=0;c<n;c++){a=l=0;for(let w=0;w<n;w++)a=a<<1&2047|o.get(c,w),w>=10&&(a===1488||a===93)&&s++,l=l<<1&2047|o.get(w,c),w>=10&&(l===1488||l===93)&&s++}return s*t.N3},e.getPenaltyN4=function(o){let n=0;const s=o.data.length;for(let l=0;l<s;l++)n+=o.data[l];return Math.abs(Math.ceil(n*100/s/5)-10)*t.N4};function i(r,o,n){switch(r){case e.Patterns.PATTERN000:return(o+n)%2===0;case e.Patterns.PATTERN001:return o%2===0;case e.Patterns.PATTERN010:return n%3===0;case e.Patterns.PATTERN011:return(o+n)%3===0;case e.Patterns.PATTERN100:return(Math.floor(o/2)+Math.floor(n/3))%2===0;case e.Patterns.PATTERN101:return o*n%2+o*n%3===0;case e.Patterns.PATTERN110:return(o*n%2+o*n%3)%2===0;case e.Patterns.PATTERN111:return(o*n%3+(o+n)%2)%2===0;default:throw new Error("bad maskPattern:"+r)}}e.applyMask=function(o,n){const s=n.size;for(let a=0;a<s;a++)for(let l=0;l<s;l++)n.isReserved(l,a)||n.xor(l,a,i(o,l,a))},e.getBestMask=function(o,n){const s=Object.keys(e.Patterns).length;let a=0,l=1/0;for(let c=0;c<s;c++){n(c),e.applyMask(c,o);const w=e.getPenaltyN1(o)+e.getPenaltyN2(o)+e.getPenaltyN3(o)+e.getPenaltyN4(o);e.applyMask(c,o),w<l&&(l=w,a=c)}return a}})(mt)),mt}var Ve={},rn;function Pn(){if(rn)return Ve;rn=1;const e=Ot(),t=[1,1,1,1,1,1,1,1,1,1,2,2,1,2,2,4,1,2,4,4,2,4,4,4,2,4,6,5,2,4,6,6,2,5,8,8,4,5,8,8,4,5,8,11,4,8,10,11,4,9,12,16,4,9,16,16,6,10,12,18,6,10,17,16,6,11,16,19,6,13,18,21,7,14,21,25,8,16,20,25,8,17,23,25,9,17,23,34,9,18,25,30,10,20,27,32,12,21,29,35,12,23,34,37,12,25,34,40,13,26,35,42,14,28,38,45,15,29,40,48,16,31,43,51,17,33,45,54,18,35,48,57,19,37,51,60,19,38,53,63,20,40,56,66,21,43,59,70,22,45,62,74,24,47,65,77,25,49,68,81],i=[7,10,13,17,10,16,22,28,15,26,36,44,20,36,52,64,26,48,72,88,36,64,96,112,40,72,108,130,48,88,132,156,60,110,160,192,72,130,192,224,80,150,224,264,96,176,260,308,104,198,288,352,120,216,320,384,132,240,360,432,144,280,408,480,168,308,448,532,180,338,504,588,196,364,546,650,224,416,600,700,224,442,644,750,252,476,690,816,270,504,750,900,300,560,810,960,312,588,870,1050,336,644,952,1110,360,700,1020,1200,390,728,1050,1260,420,784,1140,1350,450,812,1200,1440,480,868,1290,1530,510,924,1350,1620,540,980,1440,1710,570,1036,1530,1800,570,1064,1590,1890,600,1120,1680,1980,630,1204,1770,2100,660,1260,1860,2220,720,1316,1950,2310,750,1372,2040,2430];return Ve.getBlocksCount=function(o,n){switch(n){case e.L:return t[(o-1)*4+0];case e.M:return t[(o-1)*4+1];case e.Q:return t[(o-1)*4+2];case e.H:return t[(o-1)*4+3];default:return}},Ve.getTotalCodewordsCount=function(o,n){switch(n){case e.L:return i[(o-1)*4+0];case e.M:return i[(o-1)*4+1];case e.Q:return i[(o-1)*4+2];case e.H:return i[(o-1)*4+3];default:return}},Ve}var wt={},Ne={},on;function yi(){if(on)return Ne;on=1;const e=new Uint8Array(512),t=new Uint8Array(256);return(function(){let r=1;for(let o=0;o<255;o++)e[o]=r,t[r]=o,r<<=1,r&256&&(r^=285);for(let o=255;o<512;o++)e[o]=e[o-255]})(),Ne.log=function(r){if(r<1)throw new Error("log("+r+")");return t[r]},Ne.exp=function(r){return e[r]},Ne.mul=function(r,o){return r===0||o===0?0:e[t[r]+t[o]]},Ne}var sn;function vi(){return sn||(sn=1,(function(e){const t=yi();e.mul=function(r,o){const n=new Uint8Array(r.length+o.length-1);for(let s=0;s<r.length;s++)for(let a=0;a<o.length;a++)n[s+a]^=t.mul(r[s],o[a]);return n},e.mod=function(r,o){let n=new Uint8Array(r);for(;n.length-o.length>=0;){const s=n[0];for(let l=0;l<o.length;l++)n[l]^=t.mul(o[l],s);let a=0;for(;a<n.length&&n[a]===0;)a++;n=n.slice(a)}return n},e.generateECPolynomial=function(r){let o=new Uint8Array([1]);for(let n=0;n<r;n++)o=e.mul(o,new Uint8Array([1,t.exp(n)]));return o}})(wt)),wt}var bt,an;function $i(){if(an)return bt;an=1;const e=vi();function t(i){this.genPoly=void 0,this.degree=i,this.degree&&this.initialize(this.degree)}return t.prototype.initialize=function(r){this.degree=r,this.genPoly=e.generateECPolynomial(this.degree)},t.prototype.encode=function(r){if(!this.genPoly)throw new Error("Encoder not initialized");const o=new Uint8Array(r.length+this.degree);o.set(r);const n=e.mod(o,this.genPoly),s=this.degree-n.length;if(s>0){const a=new Uint8Array(this.degree);return a.set(n,s),a}return n},bt=t,bt}var yt={},vt={},$t={},ln;function Ln(){return ln||(ln=1,$t.isValid=function(t){return!isNaN(t)&&t>=1&&t<=40}),$t}var te={},cn;function Nn(){if(cn)return te;cn=1;const e="[0-9]+",t="[A-Z $%*+\\-./:]+";let i="(?:[u3000-u303F]|[u3040-u309F]|[u30A0-u30FF]|[uFF00-uFFEF]|[u4E00-u9FAF]|[u2605-u2606]|[u2190-u2195]|u203B|[u2010u2015u2018u2019u2025u2026u201Cu201Du2225u2260]|[u0391-u0451]|[u00A7u00A8u00B1u00B4u00D7u00F7])+";i=i.replace(/u/g,"\\u");const r="(?:(?![A-Z0-9 $%*+\\-./:]|"+i+`)(?:.|[\r
]))+`;te.KANJI=new RegExp(i,"g"),te.BYTE_KANJI=new RegExp("[^A-Z0-9 $%*+\\-./:]+","g"),te.BYTE=new RegExp(r,"g"),te.NUMERIC=new RegExp(e,"g"),te.ALPHANUMERIC=new RegExp(t,"g");const o=new RegExp("^"+i+"$"),n=new RegExp("^"+e+"$"),s=new RegExp("^[A-Z0-9 $%*+\\-./:]+$");return te.testKanji=function(l){return o.test(l)},te.testNumeric=function(l){return n.test(l)},te.testAlphanumeric=function(l){return s.test(l)},te}var un;function Te(){return un||(un=1,(function(e){const t=Ln(),i=Nn();e.NUMERIC={id:"Numeric",bit:1,ccBits:[10,12,14]},e.ALPHANUMERIC={id:"Alphanumeric",bit:2,ccBits:[9,11,13]},e.BYTE={id:"Byte",bit:4,ccBits:[8,16,16]},e.KANJI={id:"Kanji",bit:8,ccBits:[8,10,12]},e.MIXED={bit:-1},e.getCharCountIndicator=function(n,s){if(!n.ccBits)throw new Error("Invalid mode: "+n);if(!t.isValid(s))throw new Error("Invalid version: "+s);return s>=1&&s<10?n.ccBits[0]:s<27?n.ccBits[1]:n.ccBits[2]},e.getBestModeForData=function(n){return i.testNumeric(n)?e.NUMERIC:i.testAlphanumeric(n)?e.ALPHANUMERIC:i.testKanji(n)?e.KANJI:e.BYTE},e.toString=function(n){if(n&&n.id)return n.id;throw new Error("Invalid mode")},e.isValid=function(n){return n&&n.bit&&n.ccBits};function r(o){if(typeof o!="string")throw new Error("Param is not a string");switch(o.toLowerCase()){case"numeric":return e.NUMERIC;case"alphanumeric":return e.ALPHANUMERIC;case"kanji":return e.KANJI;case"byte":return e.BYTE;default:throw new Error("Unknown mode: "+o)}}e.from=function(n,s){if(e.isValid(n))return n;try{return r(n)}catch{return s}}})(vt)),vt}var dn;function Ci(){return dn||(dn=1,(function(e){const t=Se(),i=Pn(),r=Ot(),o=Te(),n=Ln(),s=7973,a=t.getBCHDigit(s);function l(C,m,x){for(let h=1;h<=40;h++)if(m<=e.getCapacity(h,x,C))return h}function c(C,m){return o.getCharCountIndicator(C,m)+4}function w(C,m){let x=0;return C.forEach(function(h){const b=c(h.mode,m);x+=b+h.getBitsLength()}),x}function E(C,m){for(let x=1;x<=40;x++)if(w(C,x)<=e.getCapacity(x,m,o.MIXED))return x}e.from=function(m,x){return n.isValid(m)?parseInt(m,10):x},e.getCapacity=function(m,x,h){if(!n.isValid(m))throw new Error("Invalid QR Code version");typeof h>"u"&&(h=o.BYTE);const b=t.getSymbolTotalCodewords(m),p=i.getTotalCodewordsCount(m,x),g=(b-p)*8;if(h===o.MIXED)return g;const y=g-c(h,m);switch(h){case o.NUMERIC:return Math.floor(y/10*3);case o.ALPHANUMERIC:return Math.floor(y/11*2);case o.KANJI:return Math.floor(y/13);case o.BYTE:default:return Math.floor(y/8)}},e.getBestVersionForData=function(m,x){let h;const b=r.from(x,r.M);if(Array.isArray(m)){if(m.length>1)return E(m,b);if(m.length===0)return 1;h=m[0]}else h=m;return l(h.mode,h.getLength(),b)},e.getEncodedBits=function(m){if(!n.isValid(m)||m<7)throw new Error("Invalid QR Code version");let x=m<<12;for(;t.getBCHDigit(x)-a>=0;)x^=s<<t.getBCHDigit(x)-a;return m<<12|x}})(yt)),yt}var Ct={},hn;function xi(){if(hn)return Ct;hn=1;const e=Se(),t=1335,i=21522,r=e.getBCHDigit(t);return Ct.getEncodedBits=function(n,s){const a=n.bit<<3|s;let l=a<<10;for(;e.getBCHDigit(l)-r>=0;)l^=t<<e.getBCHDigit(l)-r;return(a<<10|l)^i},Ct}var xt={},Et,fn;function Ei(){if(fn)return Et;fn=1;const e=Te();function t(i){this.mode=e.NUMERIC,this.data=i.toString()}return t.getBitsLength=function(r){return 10*Math.floor(r/3)+(r%3?r%3*3+1:0)},t.prototype.getLength=function(){return this.data.length},t.prototype.getBitsLength=function(){return t.getBitsLength(this.data.length)},t.prototype.write=function(r){let o,n,s;for(o=0;o+3<=this.data.length;o+=3)n=this.data.substr(o,3),s=parseInt(n,10),r.put(s,10);const a=this.data.length-o;a>0&&(n=this.data.substr(o),s=parseInt(n,10),r.put(s,a*3+1))},Et=t,Et}var Rt,pn;function Ri(){if(pn)return Rt;pn=1;const e=Te(),t=["0","1","2","3","4","5","6","7","8","9","A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z"," ","$","%","*","+","-",".","/",":"];function i(r){this.mode=e.ALPHANUMERIC,this.data=r}return i.getBitsLength=function(o){return 11*Math.floor(o/2)+6*(o%2)},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(o){let n;for(n=0;n+2<=this.data.length;n+=2){let s=t.indexOf(this.data[n])*45;s+=t.indexOf(this.data[n+1]),o.put(s,11)}this.data.length%2&&o.put(t.indexOf(this.data[n]),6)},Rt=i,Rt}var St,gn;function Si(){if(gn)return St;gn=1;const e=ei(),t=Te();function i(r){this.mode=t.BYTE,typeof r=="string"&&(r=e(r)),this.data=new Uint8Array(r)}return i.getBitsLength=function(o){return o*8},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(r){for(let o=0,n=this.data.length;o<n;o++)r.put(this.data[o],8)},St=i,St}var Tt,mn;function Ti(){if(mn)return Tt;mn=1;const e=Te(),t=Se();function i(r){this.mode=e.KANJI,this.data=r}return i.getBitsLength=function(o){return o*13},i.prototype.getLength=function(){return this.data.length},i.prototype.getBitsLength=function(){return i.getBitsLength(this.data.length)},i.prototype.write=function(r){let o;for(o=0;o<this.data.length;o++){let n=t.toSJIS(this.data[o]);if(n>=33088&&n<=40956)n-=33088;else if(n>=57408&&n<=60351)n-=49472;else throw new Error("Invalid SJIS character: "+this.data[o]+`
Make sure your charset is UTF-8`);n=(n>>>8&255)*192+(n&255),r.put(n,13)}},Tt=i,Tt}var wn;function _i(){return wn||(wn=1,(function(e){const t=Te(),i=Ei(),r=Ri(),o=Si(),n=Ti(),s=Nn(),a=Se(),l=ti();function c(p){return unescape(encodeURIComponent(p)).length}function w(p,g,y){const f=[];let M;for(;(M=p.exec(y))!==null;)f.push({data:M[0],index:M.index,mode:g,length:M[0].length});return f}function E(p){const g=w(s.NUMERIC,t.NUMERIC,p),y=w(s.ALPHANUMERIC,t.ALPHANUMERIC,p);let f,M;return a.isKanjiModeEnabled()?(f=w(s.BYTE,t.BYTE,p),M=w(s.KANJI,t.KANJI,p)):(f=w(s.BYTE_KANJI,t.BYTE,p),M=[]),g.concat(y,f,M).sort(function(I,T){return I.index-T.index}).map(function(I){return{data:I.data,mode:I.mode,length:I.length}})}function C(p,g){switch(g){case t.NUMERIC:return i.getBitsLength(p);case t.ALPHANUMERIC:return r.getBitsLength(p);case t.KANJI:return n.getBitsLength(p);case t.BYTE:return o.getBitsLength(p)}}function m(p){return p.reduce(function(g,y){const f=g.length-1>=0?g[g.length-1]:null;return f&&f.mode===y.mode?(g[g.length-1].data+=y.data,g):(g.push(y),g)},[])}function x(p){const g=[];for(let y=0;y<p.length;y++){const f=p[y];switch(f.mode){case t.NUMERIC:g.push([f,{data:f.data,mode:t.ALPHANUMERIC,length:f.length},{data:f.data,mode:t.BYTE,length:f.length}]);break;case t.ALPHANUMERIC:g.push([f,{data:f.data,mode:t.BYTE,length:f.length}]);break;case t.KANJI:g.push([f,{data:f.data,mode:t.BYTE,length:c(f.data)}]);break;case t.BYTE:g.push([{data:f.data,mode:t.BYTE,length:c(f.data)}])}}return g}function h(p,g){const y={},f={start:{}};let M=["start"];for(let $=0;$<p.length;$++){const I=p[$],T=[];for(let v=0;v<I.length;v++){const A=I[v],R=""+$+v;T.push(R),y[R]={node:A,lastCount:0},f[R]={};for(let W=0;W<M.length;W++){const S=M[W];y[S]&&y[S].node.mode===A.mode?(f[S][R]=C(y[S].lastCount+A.length,A.mode)-C(y[S].lastCount,A.mode),y[S].lastCount+=A.length):(y[S]&&(y[S].lastCount=A.length),f[S][R]=C(A.length,A.mode)+4+t.getCharCountIndicator(A.mode,g))}}M=T}for(let $=0;$<M.length;$++)f[M[$]].end=0;return{map:f,table:y}}function b(p,g){let y;const f=t.getBestModeForData(p);if(y=t.from(g,f),y!==t.BYTE&&y.bit<f.bit)throw new Error('"'+p+'" cannot be encoded with mode '+t.toString(y)+`.
 Suggested mode is: `+t.toString(f));switch(y===t.KANJI&&!a.isKanjiModeEnabled()&&(y=t.BYTE),y){case t.NUMERIC:return new i(p);case t.ALPHANUMERIC:return new r(p);case t.KANJI:return new n(p);case t.BYTE:return new o(p)}}e.fromArray=function(g){return g.reduce(function(y,f){return typeof f=="string"?y.push(b(f,null)):f.data&&y.push(b(f.data,f.mode)),y},[])},e.fromString=function(g,y){const f=E(g,a.isKanjiModeEnabled()),M=x(f),$=h(M,y),I=l.find_path($.map,"start","end"),T=[];for(let v=1;v<I.length-1;v++)T.push($.table[I[v]].node);return e.fromArray(m(T))},e.rawSplit=function(g){return e.fromArray(E(g,a.isKanjiModeEnabled()))}})(xt)),xt}var bn;function Ii(){if(bn)return ut;bn=1;const e=Se(),t=Ot(),i=pi(),r=gi(),o=mi(),n=wi(),s=bi(),a=Pn(),l=$i(),c=Ci(),w=xi(),E=Te(),C=_i();function m($,I){const T=$.size,v=n.getPositions(I);for(let A=0;A<v.length;A++){const R=v[A][0],W=v[A][1];for(let S=-1;S<=7;S++)if(!(R+S<=-1||T<=R+S))for(let k=-1;k<=7;k++)W+k<=-1||T<=W+k||(S>=0&&S<=6&&(k===0||k===6)||k>=0&&k<=6&&(S===0||S===6)||S>=2&&S<=4&&k>=2&&k<=4?$.set(R+S,W+k,!0,!0):$.set(R+S,W+k,!1,!0))}}function x($){const I=$.size;for(let T=8;T<I-8;T++){const v=T%2===0;$.set(T,6,v,!0),$.set(6,T,v,!0)}}function h($,I){const T=o.getPositions(I);for(let v=0;v<T.length;v++){const A=T[v][0],R=T[v][1];for(let W=-2;W<=2;W++)for(let S=-2;S<=2;S++)W===-2||W===2||S===-2||S===2||W===0&&S===0?$.set(A+W,R+S,!0,!0):$.set(A+W,R+S,!1,!0)}}function b($,I){const T=$.size,v=c.getEncodedBits(I);let A,R,W;for(let S=0;S<18;S++)A=Math.floor(S/3),R=S%3+T-8-3,W=(v>>S&1)===1,$.set(A,R,W,!0),$.set(R,A,W,!0)}function p($,I,T){const v=$.size,A=w.getEncodedBits(I,T);let R,W;for(R=0;R<15;R++)W=(A>>R&1)===1,R<6?$.set(R,8,W,!0):R<8?$.set(R+1,8,W,!0):$.set(v-15+R,8,W,!0),R<8?$.set(8,v-R-1,W,!0):R<9?$.set(8,15-R-1+1,W,!0):$.set(8,15-R-1,W,!0);$.set(v-8,8,1,!0)}function g($,I){const T=$.size;let v=-1,A=T-1,R=7,W=0;for(let S=T-1;S>0;S-=2)for(S===6&&S--;;){for(let k=0;k<2;k++)if(!$.isReserved(A,S-k)){let he=!1;W<I.length&&(he=(I[W]>>>R&1)===1),$.set(A,S-k,he),R--,R===-1&&(W++,R=7)}if(A+=v,A<0||T<=A){A-=v,v=-v;break}}}function y($,I,T){const v=new i;T.forEach(function(k){v.put(k.mode.bit,4),v.put(k.getLength(),E.getCharCountIndicator(k.mode,$)),k.write(v)});const A=e.getSymbolTotalCodewords($),R=a.getTotalCodewordsCount($,I),W=(A-R)*8;for(v.getLengthInBits()+4<=W&&v.put(0,4);v.getLengthInBits()%8!==0;)v.putBit(0);const S=(W-v.getLengthInBits())/8;for(let k=0;k<S;k++)v.put(k%2?17:236,8);return f(v,$,I)}function f($,I,T){const v=e.getSymbolTotalCodewords(I),A=a.getTotalCodewordsCount(I,T),R=v-A,W=a.getBlocksCount(I,T),S=v%W,k=W-S,he=Math.floor(v/W),Le=Math.floor(R/W),Fn=Le+1,zt=he-Le,Vn=new l(zt);let ot=0;const Fe=new Array(W),qt=new Array(W);let st=0;const Kn=new Uint8Array($.buffer);for(let Ie=0;Ie<W;Ie++){const lt=Ie<k?Le:Fn;Fe[Ie]=Kn.slice(ot,ot+lt),qt[Ie]=Vn.encode(Fe[Ie]),ot+=lt,st=Math.max(st,lt)}const at=new Uint8Array(v);let Ft=0,se,ae;for(se=0;se<st;se++)for(ae=0;ae<W;ae++)se<Fe[ae].length&&(at[Ft++]=Fe[ae][se]);for(se=0;se<zt;se++)for(ae=0;ae<W;ae++)at[Ft++]=qt[ae][se];return at}function M($,I,T,v){let A;if(Array.isArray($))A=C.fromArray($);else if(typeof $=="string"){let he=I;if(!he){const Le=C.rawSplit($);he=c.getBestVersionForData(Le,T)}A=C.fromString($,he||40)}else throw new Error("Invalid data");const R=c.getBestVersionForData(A,T);if(!R)throw new Error("The amount of data is too big to be stored in a QR Code");if(!I)I=R;else if(I<R)throw new Error(`
The chosen QR Code version cannot contain this amount of data.
Minimum version required to store current data is: `+R+`.
`);const W=y(I,T,A),S=e.getSymbolSize(I),k=new r(S);return m(k,I),x(k),h(k,I),p(k,T,0),I>=7&&b(k,I),g(k,W),isNaN(v)&&(v=s.getBestMask(k,p.bind(null,k,T))),s.applyMask(v,k),p(k,T,v),{modules:k,version:I,errorCorrectionLevel:T,maskPattern:v,segments:A}}return ut.create=function(I,T){if(typeof I>"u"||I==="")throw new Error("No input text");let v=t.M,A,R;return typeof T<"u"&&(v=t.from(T.errorCorrectionLevel,t.M),A=c.from(T.version),R=s.from(T.maskPattern),T.toSJISFunc&&e.setToSJISFunction(T.toSJISFunc)),M(I,A,v,R)},ut}var _t={},It={},yn;function On(){return yn||(yn=1,(function(e){function t(i){if(typeof i=="number"&&(i=i.toString()),typeof i!="string")throw new Error("Color should be defined as hex string");let r=i.slice().replace("#","").split("");if(r.length<3||r.length===5||r.length>8)throw new Error("Invalid hex color: "+i);(r.length===3||r.length===4)&&(r=Array.prototype.concat.apply([],r.map(function(n){return[n,n]}))),r.length===6&&r.push("F","F");const o=parseInt(r.join(""),16);return{r:o>>24&255,g:o>>16&255,b:o>>8&255,a:o&255,hex:"#"+r.slice(0,6).join("")}}e.getOptions=function(r){r||(r={}),r.color||(r.color={});const o=typeof r.margin>"u"||r.margin===null||r.margin<0?4:r.margin,n=r.width&&r.width>=21?r.width:void 0,s=r.scale||4;return{width:n,scale:n?4:s,margin:o,color:{dark:t(r.color.dark||"#000000ff"),light:t(r.color.light||"#ffffffff")},type:r.type,rendererOpts:r.rendererOpts||{}}},e.getScale=function(r,o){return o.width&&o.width>=r+o.margin*2?o.width/(r+o.margin*2):o.scale},e.getImageWidth=function(r,o){const n=e.getScale(r,o);return Math.floor((r+o.margin*2)*n)},e.qrToImageData=function(r,o,n){const s=o.modules.size,a=o.modules.data,l=e.getScale(s,n),c=Math.floor((s+n.margin*2)*l),w=n.margin*l,E=[n.color.light,n.color.dark];for(let C=0;C<c;C++)for(let m=0;m<c;m++){let x=(C*c+m)*4,h=n.color.light;if(C>=w&&m>=w&&C<c-w&&m<c-w){const b=Math.floor((C-w)/l),p=Math.floor((m-w)/l);h=E[a[b*s+p]?1:0]}r[x++]=h.r,r[x++]=h.g,r[x++]=h.b,r[x]=h.a}}})(It)),It}var vn;function Wi(){return vn||(vn=1,(function(e){const t=On();function i(o,n,s){o.clearRect(0,0,n.width,n.height),n.style||(n.style={}),n.height=s,n.width=s,n.style.height=s+"px",n.style.width=s+"px"}function r(){try{return document.createElement("canvas")}catch{throw new Error("You need to specify a canvas element")}}e.render=function(n,s,a){let l=a,c=s;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),s||(c=r()),l=t.getOptions(l);const w=t.getImageWidth(n.modules.size,l),E=c.getContext("2d"),C=E.createImageData(w,w);return t.qrToImageData(C.data,n,l),i(E,c,w),E.putImageData(C,0,0),c},e.renderToDataURL=function(n,s,a){let l=a;typeof l>"u"&&(!s||!s.getContext)&&(l=s,s=void 0),l||(l={});const c=e.render(n,s,l),w=l.type||"image/png",E=l.rendererOpts||{};return c.toDataURL(w,E.quality)}})(_t)),_t}var Wt={},$n;function Ai(){if($n)return Wt;$n=1;const e=On();function t(o,n){const s=o.a/255,a=n+'="'+o.hex+'"';return s<1?a+" "+n+'-opacity="'+s.toFixed(2).slice(1)+'"':a}function i(o,n,s){let a=o+n;return typeof s<"u"&&(a+=" "+s),a}function r(o,n,s){let a="",l=0,c=!1,w=0;for(let E=0;E<o.length;E++){const C=Math.floor(E%n),m=Math.floor(E/n);!C&&!c&&(c=!0),o[E]?(w++,E>0&&C>0&&o[E-1]||(a+=c?i("M",C+s,.5+m+s):i("m",l,0),l=0,c=!1),C+1<n&&o[E+1]||(a+=i("h",w),w=0)):l++}return a}return Wt.render=function(n,s,a){const l=e.getOptions(s),c=n.modules.size,w=n.modules.data,E=c+l.margin*2,C=l.color.light.a?"<path "+t(l.color.light,"fill")+' d="M0 0h'+E+"v"+E+'H0z"/>':"",m="<path "+t(l.color.dark,"stroke")+' d="'+r(w,c,l.margin)+'"/>',x='viewBox="0 0 '+E+" "+E+'"',b='<svg xmlns="http://www.w3.org/2000/svg" '+(l.width?'width="'+l.width+'" height="'+l.width+'" ':"")+x+' shape-rendering="crispEdges">'+C+m+`</svg>
`;return typeof a=="function"&&a(null,b),b},Wt}var Cn;function ki(){if(Cn)return We;Cn=1;const e=fi(),t=Ii(),i=Wi(),r=Ai();function o(n,s,a,l,c){const w=[].slice.call(arguments,1),E=w.length,C=typeof w[E-1]=="function";if(!C&&!e())throw new Error("Callback required as last argument");if(C){if(E<2)throw new Error("Too few arguments provided");E===2?(c=a,a=s,s=l=void 0):E===3&&(s.getContext&&typeof c>"u"?(c=l,l=void 0):(c=l,l=a,a=s,s=void 0))}else{if(E<1)throw new Error("Too few arguments provided");return E===1?(a=s,s=l=void 0):E===2&&!s.getContext&&(l=a,a=s,s=void 0),new Promise(function(m,x){try{const h=t.create(a,l);m(n(h,s,l))}catch(h){x(h)}})}try{const m=t.create(a,l);c(null,n(m,s,l))}catch(m){c(m)}}return We.create=t.create,We.toCanvas=o.bind(null,i.render),We.toDataURL=o.bind(null,i.renderToDataURL),We.toString=o.bind(null,function(n,s,a){return r.render(n,a)}),We}var Bi=ki();const Pi=Zn(Bi),Li=.1,xn=2.5,le=7;function At(e,t,i){return e===t?!1:(e-t<0?t-e:e-t)<=i+Li}function Ni(e,t){const i=Array.prototype.slice.call(Pi.create(e,{errorCorrectionLevel:t}).modules.data,0),r=Math.sqrt(i.length);return i.reduce((o,n,s)=>(s%r===0?o.push([n]):o[o.length-1].push(n))&&o,[])}const Oi={generate({uri:e,size:t,logoSize:i,padding:r=8,dotColor:o="var(--apkt-colors-black)"}){const s=[],a=Ni(e,"Q"),l=(t-2*r)/a.length,c=[{x:0,y:0},{x:1,y:0},{x:0,y:1}];c.forEach(({x:h,y:b})=>{const p=(a.length-le)*l*h+r,g=(a.length-le)*l*b+r,y=.45;for(let f=0;f<c.length;f+=1){const M=l*(le-f*2);s.push(Oe`
            <rect
              fill=${f===2?"var(--apkt-colors-black)":"var(--apkt-colors-white)"}
              width=${f===0?M-10:M}
              rx= ${f===0?(M-10)*y:M*y}
              ry= ${f===0?(M-10)*y:M*y}
              stroke=${o}
              stroke-width=${f===0?10:0}
              height=${f===0?M-10:M}
              x= ${f===0?g+l*f+10/2:g+l*f}
              y= ${f===0?p+l*f+10/2:p+l*f}
            />
          `)}});const w=Math.floor((i+25)/l),E=a.length/2-w/2,C=a.length/2+w/2-1,m=[];a.forEach((h,b)=>{h.forEach((p,g)=>{if(a[b][g]&&!(b<le&&g<le||b>a.length-(le+1)&&g<le||b<le&&g>a.length-(le+1))&&!(b>E&&b<C&&g>E&&g<C)){const y=b*l+l/2+r,f=g*l+l/2+r;m.push([y,f])}})});const x={};return m.forEach(([h,b])=>{x[h]?x[h]?.push(b):x[h]=[b]}),Object.entries(x).map(([h,b])=>{const p=b.filter(g=>b.every(y=>!At(g,y,l)));return[Number(h),p]}).forEach(([h,b])=>{b.forEach(p=>{s.push(Oe`<circle cx=${h} cy=${p} fill=${o} r=${l/xn} />`)})}),Object.entries(x).filter(([h,b])=>b.length>1).map(([h,b])=>{const p=b.filter(g=>b.some(y=>At(g,y,l)));return[Number(h),p]}).map(([h,b])=>{b.sort((g,y)=>g<y?-1:1);const p=[];for(const g of b){const y=p.find(f=>f.some(M=>At(g,M,l)));y?y.push(g):p.push([g])}return[h,p.map(g=>[g[0],g[g.length-1]])]}).forEach(([h,b])=>{b.forEach(([p,g])=>{s.push(Oe`
              <line
                x1=${h}
                x2=${h}
                y1=${p}
                y2=${g}
                stroke=${o}
                stroke-width=${l/(xn/2)}
                stroke-linecap="round"
              />
            `)})}),s}},Mi=U`
  :host {
    position: relative;
    user-select: none;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    width: 100%;
    height: 100%;
    background-color: ${({colors:e})=>e.white};
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  :host {
    border-radius: ${({borderRadius:e})=>e[4]};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :host([data-clear='true']) > wui-icon {
    display: none;
  }

  svg:first-child,
  wui-image,
  wui-icon {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translateY(-50%) translateX(-50%);
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    box-shadow: inset 0 0 0 4px ${({tokens:e})=>e.theme.backgroundPrimary};
    border-radius: ${({borderRadius:e})=>e[6]};
  }

  wui-image {
    width: 25%;
    height: 25%;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  wui-icon {
    width: 100%;
    height: 100%;
    color: #3396ff !important;
    transform: translateY(-50%) translateX(-50%) scale(0.25);
  }

  wui-icon > svg {
    width: inherit;
    height: inherit;
  }
`;var we=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let ne=class extends D{constructor(){super(...arguments),this.uri="",this.size=500,this.theme="dark",this.imageSrc=void 0,this.alt=void 0,this.arenaClear=void 0,this.farcaster=void 0}render(){return this.dataset.theme=this.theme,this.dataset.clear=String(this.arenaClear),u`<wui-flex
      alignItems="center"
      justifyContent="center"
      class="wui-qr-code"
      direction="column"
      gap="4"
      width="100%"
      style="height: 100%"
    >
      ${this.templateVisual()} ${this.templateSvg()}
    </wui-flex>`}templateSvg(){return Oe`
      <svg viewBox="0 0 ${this.size} ${this.size}" width="100%" height="100%">
        ${Oi.generate({uri:this.uri,size:this.size,logoSize:this.arenaClear?0:this.size/4})}
      </svg>
    `}templateVisual(){return this.imageSrc?u`<wui-image src=${this.imageSrc} alt=${this.alt??"logo"}></wui-image>`:this.farcaster?u`<wui-icon
        class="farcaster"
        size="inherit"
        color="inherit"
        name="farcaster"
      ></wui-icon>`:u`<wui-icon size="inherit" color="inherit" name="walletConnect"></wui-icon>`}};ne.styles=[J,Mi];we([d()],ne.prototype,"uri",void 0);we([d({type:Number})],ne.prototype,"size",void 0);we([d()],ne.prototype,"theme",void 0);we([d()],ne.prototype,"imageSrc",void 0);we([d()],ne.prototype,"alt",void 0);we([d({type:Boolean})],ne.prototype,"arenaClear",void 0);we([d({type:Boolean})],ne.prototype,"farcaster",void 0);ne=we([O("wui-qr-code")],ne);const Di=U`
  :host {
    display: block;
    background: linear-gradient(
      90deg,
      ${({tokens:e})=>e.theme.foregroundSecondary} 0%,
      ${({tokens:e})=>e.theme.foregroundTertiary} 50%,
      ${({tokens:e})=>e.theme.foregroundSecondary} 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1s ease-in-out infinite;
    border-radius: ${({borderRadius:e})=>e[2]};
  }

  :host([data-rounded='true']) {
    border-radius: ${({borderRadius:e})=>e[16]};
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;var ze=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ee=class extends D{constructor(){super(...arguments),this.width="",this.height="",this.variant="default",this.rounded=!1}render(){return this.style.cssText=`
      width: ${this.width};
      height: ${this.height};
    `,this.dataset.rounded=this.rounded?"true":"false",u`<slot></slot>`}};Ee.styles=[Di];ze([d()],Ee.prototype,"width",void 0);ze([d()],Ee.prototype,"height",void 0);ze([d()],Ee.prototype,"variant",void 0);ze([d({type:Boolean})],Ee.prototype,"rounded",void 0);Ee=ze([O("wui-shimmer")],Ee);const ji=U`
  wui-shimmer {
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: ${({borderRadius:e})=>e[4]};
  }

  wui-qr-code {
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-out-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;var Mn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Je=class extends z{constructor(){super(),this.basic=!1}firstUpdated(){this.basic||F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet?.name??"WalletConnect",platform:"qrcode",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:B.state.view}})}disconnectedCallback(){super.disconnectedCallback(),this.unsubscribe?.forEach(t=>t())}render(){return this.onRenderProxy(),u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["0","5","5","5"]}
        gap="5"
      >
        <wui-shimmer width="100%"> ${this.qrCodeTemplate()} </wui-shimmer>
        <wui-text variant="lg-medium" color="primary"> Scan this QR Code with your phone </wui-text>
        ${this.copyTemplate()}
      </wui-flex>
      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}onRenderProxy(){!this.ready&&this.uri&&(this.ready=!0)}qrCodeTemplate(){if(!this.uri||!this.ready)return null;const t=this.wallet?this.wallet.name:void 0;return P.setWcLinking(void 0),P.setRecentWallet(this.wallet),u` <wui-qr-code
      theme=${Bt.state.themeMode}
      uri=${this.uri}
      imageSrc=${j(ge.getWalletImage(this.wallet))}
      color=${j(Bt.state.themeVariables["--w3m-qr-color"])}
      alt=${j(t)}
      data-testid="wui-qr-code"
    ></wui-qr-code>`}copyTemplate(){const t=!this.uri||!this.ready;return u`<wui-button
      .disabled=${t}
      @click=${this.onCopyUri}
      variant="neutral-secondary"
      size="sm"
      data-testid="copy-wc2-uri"
    >
      Copy link
      <wui-icon size="sm" color="inherit" name="copy" slot="iconRight"></wui-icon>
    </wui-button>`}};Je.styles=ji;Mn([d({type:Boolean})],Je.prototype,"basic",void 0);Je=Mn([O("w3m-connecting-wc-qrcode")],Je);var Ui=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let En=class extends D{constructor(){if(super(),this.wallet=B.state.data?.wallet,!this.wallet)throw new Error("w3m-connecting-wc-unsupported: No wallet provided");F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"browser",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:B.state.view}})}render(){return u`
      <wui-flex
        flexDirection="column"
        alignItems="center"
        .padding=${["10","5","5","5"]}
        gap="5"
      >
        <wui-wallet-image
          size="lg"
          imageSrc=${j(ge.getWalletImage(this.wallet))}
        ></wui-wallet-image>

        <wui-text variant="md-regular" color="primary">Not Detected</wui-text>
      </wui-flex>

      <w3m-mobile-download-links .wallet=${this.wallet}></w3m-mobile-download-links>
    `}};En=Ui([O("w3m-connecting-wc-unsupported")],En);var Dn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Lt=class extends z{constructor(){if(super(),this.isLoading=!0,!this.wallet)throw new Error("w3m-connecting-wc-web: No wallet provided");this.onConnect=this.onConnectProxy.bind(this),this.secondaryBtnLabel="Open",this.secondaryLabel=Wn.CONNECT_LABELS.MOBILE,this.secondaryBtnIcon="externalLink",this.updateLoadingState(),this.unsubscribe.push(P.subscribeKey("wcUri",()=>{this.updateLoadingState()})),F.sendEvent({type:"track",event:"SELECT_WALLET",properties:{name:this.wallet.name,platform:"web",displayIndex:this.wallet?.display_index,walletRank:this.wallet?.order,view:B.state.view}})}updateLoadingState(){this.isLoading=!this.uri}onConnectProxy(){if(this.wallet?.webapp_link&&this.uri)try{this.error=!1;const{webapp_link:t,name:i}=this.wallet,{redirect:r,href:o}=L.formatUniversalUrl(t,this.uri);P.setWcLinking({name:i,href:o}),P.setRecentWallet(this.wallet),L.openHref(r,"_blank")}catch{this.error=!0}}};Dn([_()],Lt.prototype,"isLoading",void 0);Lt=Dn([O("w3m-connecting-wc-web")],Lt);const zi=U`
  :host([data-mobile-fullscreen='true']) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  :host([data-mobile-fullscreen='true']) wui-ux-by-reown {
    margin-top: auto;
  }
`;var _e=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let ue=class extends D{constructor(){super(),this.wallet=B.state.data?.wallet,this.unsubscribe=[],this.platform=void 0,this.platforms=[],this.isSiwxEnabled=!!q.state.siwx,this.remoteFeatures=q.state.remoteFeatures,this.displayBranding=!0,this.basic=!1,this.determinePlatforms(),this.initializeConnection(),this.unsubscribe.push(q.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){return q.state.enableMobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      ${this.headerTemplate()}
      <div class="platform-container">${this.platformTemplate()}</div>
      ${this.reownBrandingTemplate()}
    `}reownBrandingTemplate(){return!this.remoteFeatures?.reownBranding||!this.displayBranding?null:u`<wui-ux-by-reown></wui-ux-by-reown>`}async initializeConnection(t=!1){if(!(this.platform==="browser"||q.state.manualWCControl&&!t))try{const{wcPairingExpiry:i,status:r}=P.state,{redirectView:o}=B.state.data??{};if(t||q.state.enableEmbedded||L.isPairingExpired(i)||r==="connecting"){const n=P.getConnections(fe.state.activeChain),s=this.remoteFeatures?.multiWallet,a=n.length>0;await P.connectWalletConnect({cache:"never"}),this.isSiwxEnabled||(a&&s?(B.replace("ProfileWallets"),De.showSuccess("New Wallet Added")):o?B.replace(o):Tn.close())}}catch(i){if(i instanceof Error&&i.message.includes("An error occurred when attempting to switch chain")&&!q.state.enableNetworkSwitch&&fe.state.activeChain){fe.setActiveCaipNetwork(Gn.getUnsupportedNetwork(`${fe.state.activeChain}:${fe.state.activeCaipNetwork?.id}`)),fe.showUnsupportedChainUI();return}i instanceof _n&&i.originalName===In.PROVIDER_RPC_ERROR_NAME.USER_REJECTED_REQUEST?F.sendEvent({type:"track",event:"USER_REJECTED",properties:{message:i.message}}):F.sendEvent({type:"track",event:"CONNECT_ERROR",properties:{message:i?.message??"Unknown"}}),P.setWcError(!0),De.showError(i.message??"Connection error"),P.resetWcConnection(),B.goBack()}}determinePlatforms(){if(!this.wallet){this.platforms.push("qrcode"),this.platform="qrcode";return}if(this.platform)return;const{mobile_link:t,desktop_link:i,webapp_link:r,injected:o,rdns:n}=this.wallet,s=o?.map(({injected_id:x})=>x).filter(Boolean),a=[...n?[n]:s??[]],l=q.state.isUniversalProvider?!1:a.length,c=t,w=r,E=P.checkInstalled(a),C=l&&E,m=i&&!L.isMobile();C&&!fe.state.noAdapters&&this.platforms.push("browser"),c&&this.platforms.push(L.isMobile()?"mobile":"qrcode"),w&&this.platforms.push("web"),m&&this.platforms.push("desktop"),!C&&l&&!fe.state.noAdapters&&this.platforms.push("unsupported"),this.platform=this.platforms[0]}platformTemplate(){switch(this.platform){case"browser":return u`<w3m-connecting-wc-browser></w3m-connecting-wc-browser>`;case"web":return u`<w3m-connecting-wc-web></w3m-connecting-wc-web>`;case"desktop":return u`
          <w3m-connecting-wc-desktop .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-desktop>
        `;case"mobile":return u`
          <w3m-connecting-wc-mobile isMobile .onRetry=${()=>this.initializeConnection(!0)}>
          </w3m-connecting-wc-mobile>
        `;case"qrcode":return u`<w3m-connecting-wc-qrcode ?basic=${this.basic}></w3m-connecting-wc-qrcode>`;default:return u`<w3m-connecting-wc-unsupported></w3m-connecting-wc-unsupported>`}}headerTemplate(){return this.platforms.length>1?u`
      <w3m-connecting-header
        .platforms=${this.platforms}
        .onSelectPlatfrom=${this.onSelectPlatform.bind(this)}
      >
      </w3m-connecting-header>
    `:null}async onSelectPlatform(t){const i=this.shadowRoot?.querySelector("div");i&&(await i.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.platform=t,i.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}};ue.styles=zi;_e([_()],ue.prototype,"platform",void 0);_e([_()],ue.prototype,"platforms",void 0);_e([_()],ue.prototype,"isSiwxEnabled",void 0);_e([_()],ue.prototype,"remoteFeatures",void 0);_e([d({type:Boolean})],ue.prototype,"displayBranding",void 0);_e([d({type:Boolean})],ue.prototype,"basic",void 0);ue=_e([O("w3m-connecting-wc-view")],ue);var Mt=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ye=class extends D{constructor(){super(),this.unsubscribe=[],this.isMobile=L.isMobile(),this.remoteFeatures=q.state.remoteFeatures,this.unsubscribe.push(q.subscribeKey("remoteFeatures",t=>this.remoteFeatures=t))}disconnectedCallback(){this.unsubscribe.forEach(t=>t())}render(){if(this.isMobile){const{featured:t,recommended:i}=N.state,{customWallets:r}=q.state,o=Qn.getRecentWallets(),n=t.length||i.length||r?.length||o.length;return u`<wui-flex flexDirection="column" gap="2" .margin=${["1","3","3","3"]}>
        ${n?u`<w3m-connector-list></w3m-connector-list>`:null}
        <w3m-all-wallets-widget></w3m-all-wallets-widget>
      </wui-flex>`}return u`<wui-flex flexDirection="column" .padding=${["0","0","4","0"]}>
        <w3m-connecting-wc-view ?basic=${!0} .displayBranding=${!1}></w3m-connecting-wc-view>
        <wui-flex flexDirection="column" .padding=${["0","3","0","3"]}>
          <w3m-all-wallets-widget></w3m-all-wallets-widget>
        </wui-flex>
      </wui-flex>
      ${this.reownBrandingTemplate()} `}reownBrandingTemplate(){return this.remoteFeatures?.reownBranding?u` <wui-flex flexDirection="column" .padding=${["1","0","1","0"]}>
      <wui-ux-by-reown></wui-ux-by-reown>
    </wui-flex>`:null}};Mt([_()],Ye.prototype,"isMobile",void 0);Mt([_()],Ye.prototype,"remoteFeatures",void 0);Ye=Mt([O("w3m-connecting-wc-basic-view")],Ye);/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const qi=e=>e.strings===void 0;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Me=(e,t)=>{const i=e._$AN;if(i===void 0)return!1;for(const r of i)r._$AO?.(t,!1),Me(r,t);return!0},Xe=e=>{let t,i;do{if((t=e._$AM)===void 0)break;i=t._$AN,i.delete(e),e=t}while(i?.size===0)},jn=e=>{for(let t;t=e._$AM;e=t){let i=t._$AN;if(i===void 0)t._$AN=i=new Set;else if(i.has(e))break;i.add(e),Ki(t)}};function Fi(e){this._$AN!==void 0?(Xe(this),this._$AM=e,jn(this)):this._$AM=e}function Vi(e,t=!1,i=0){const r=this._$AH,o=this._$AN;if(o!==void 0&&o.size!==0)if(t)if(Array.isArray(r))for(let n=i;n<r.length;n++)Me(r[n],!1),Xe(r[n]);else r!=null&&(Me(r,!1),Xe(r));else Me(this,e)}const Ki=e=>{e.type==Yn.CHILD&&(e._$AP??=Vi,e._$AQ??=Fi)};class Hi extends Jn{constructor(){super(...arguments),this._$AN=void 0}_$AT(t,i,r){super._$AT(t,i,r),jn(this),this.isConnected=t._$AU}_$AO(t,i=!0){t!==this.isConnected&&(this.isConnected=t,t?this.reconnected?.():this.disconnected?.()),i&&(Me(this,t),Xe(this))}setValue(t){if(qi(this._$Ct))this._$Ct._$AI(t,this);else{const i=[...this._$Ct._$AH];i[this._$Ci]=t,this._$Ct._$AI(i,this,0)}}disconnected(){}reconnected(){}}/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Dt=()=>new Gi;class Gi{}const kt=new WeakMap,jt=Xn(class extends Hi{render(e){return Kt}update(e,[t]){const i=t!==this.G;return i&&this.rt(void 0),(i||this.lt!==this.ct)&&(this.G=t,this.ht=e.options?.host,this.rt(this.ct=e.element)),Kt}rt(e){if(this.G!==void 0)if(this.isConnected||(e=void 0),typeof this.G=="function"){const t=this.ht??globalThis;let i=kt.get(t);i===void 0&&(i=new WeakMap,kt.set(t,i)),i.get(this.G)!==void 0&&this.G.call(this.ht,void 0),i.set(this.G,e),e!==void 0&&this.G.call(this.ht,e)}else this.G.value=e}get lt(){return typeof this.G=="function"?kt.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}}),Qi=U`
  :host {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  label {
    position: relative;
    display: inline-block;
    user-select: none;
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      border ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      width ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      height ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  input {
    width: 0;
    height: 0;
    opacity: 0;
  }

  span {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({colors:e})=>e.neutrals300};
    border-radius: ${({borderRadius:e})=>e.round};
    border: 1px solid transparent;
    will-change: border;
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      border ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      box-shadow ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      width ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      height ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]},
      transform ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      opacity ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, color, border, box-shadow, width, height, transform, opacity;
  }

  span:before {
    content: '';
    position: absolute;
    background-color: ${({colors:e})=>e.white};
    border-radius: 50%;
  }

  /* -- Sizes --------------------------------------------------------- */
  label[data-size='lg'] {
    width: 48px;
    height: 32px;
  }

  label[data-size='md'] {
    width: 40px;
    height: 28px;
  }

  label[data-size='sm'] {
    width: 32px;
    height: 22px;
  }

  label[data-size='lg'] > span:before {
    height: 24px;
    width: 24px;
    left: 4px;
    top: 3px;
  }

  label[data-size='md'] > span:before {
    height: 20px;
    width: 20px;
    left: 4px;
    top: 3px;
  }

  label[data-size='sm'] > span:before {
    height: 16px;
    width: 16px;
    left: 3px;
    top: 2px;
  }

  /* -- Focus states --------------------------------------------------- */
  input:focus-visible:not(:checked) + span,
  input:focus:not(:checked) + span {
    border: 1px solid ${({tokens:e})=>e.core.iconAccentPrimary};
    background-color: ${({tokens:e})=>e.theme.textTertiary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  input:focus-visible:checked + span,
  input:focus:checked + span {
    border: 1px solid ${({tokens:e})=>e.core.iconAccentPrimary};
    box-shadow: 0px 0px 0px 4px rgba(9, 136, 240, 0.2);
  }

  /* -- Checked states --------------------------------------------------- */
  input:checked + span {
    background-color: ${({tokens:e})=>e.core.iconAccentPrimary};
  }

  label[data-size='lg'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='md'] > input:checked + span:before {
    transform: translateX(calc(100% - 9px));
  }

  label[data-size='sm'] > input:checked + span:before {
    transform: translateX(calc(100% - 7px));
  }

  /* -- Hover states ------------------------------------------------------- */
  label:hover > input:not(:checked):not(:disabled) + span {
    background-color: ${({colors:e})=>e.neutrals400};
  }

  label:hover > input:checked:not(:disabled) + span {
    background-color: ${({colors:e})=>e.accent080};
  }

  /* -- Disabled state --------------------------------------------------- */
  label:has(input:disabled) {
    pointer-events: none;
    user-select: none;
  }

  input:not(:checked):disabled + span {
    background-color: ${({colors:e})=>e.neutrals700};
  }

  input:checked:disabled + span {
    background-color: ${({colors:e})=>e.neutrals700};
  }

  input:not(:checked):disabled + span::before {
    background-color: ${({colors:e})=>e.neutrals400};
  }

  input:checked:disabled + span::before {
    background-color: ${({tokens:e})=>e.theme.textTertiary};
  }
`;var rt=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let ke=class extends D{constructor(){super(...arguments),this.inputElementRef=Dt(),this.checked=!1,this.disabled=!1,this.size="md"}render(){return u`
      <label data-size=${this.size}>
        <input
          ${jt(this.inputElementRef)}
          type="checkbox"
          ?checked=${this.checked}
          ?disabled=${this.disabled}
          @change=${this.dispatchChangeEvent.bind(this)}
        />
        <span></span>
      </label>
    `}dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("switchChange",{detail:this.inputElementRef.value?.checked,bubbles:!0,composed:!0}))}};ke.styles=[J,me,Qi];rt([d({type:Boolean})],ke.prototype,"checked",void 0);rt([d({type:Boolean})],ke.prototype,"disabled",void 0);rt([d()],ke.prototype,"size",void 0);ke=rt([O("wui-toggle")],ke);const Ji=U`
  :host {
    height: auto;
  }

  :host > wui-flex {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    column-gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[2]} ${({spacing:e})=>e[3]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[4]};
    box-shadow: inset 0 0 0 1px ${({tokens:e})=>e.theme.foregroundPrimary};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color;
    cursor: pointer;
  }

  wui-switch {
    pointer-events: none;
  }
`;var Un=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Ze=class extends D{constructor(){super(...arguments),this.checked=!1}render(){return u`
      <wui-flex>
        <wui-icon size="xl" name="walletConnectBrown"></wui-icon>
        <wui-toggle
          ?checked=${this.checked}
          size="sm"
          @switchChange=${this.handleToggleChange.bind(this)}
        ></wui-toggle>
      </wui-flex>
    `}handleToggleChange(t){t.stopPropagation(),this.checked=t.detail,this.dispatchSwitchEvent()}dispatchSwitchEvent(){this.dispatchEvent(new CustomEvent("certifiedSwitchChange",{detail:this.checked,bubbles:!0,composed:!0}))}};Ze.styles=[J,me,Ji];Un([d({type:Boolean})],Ze.prototype,"checked",void 0);Ze=Un([O("wui-certified-switch")],Ze);const Yi=U`
  :host {
    position: relative;
    width: 100%;
    display: inline-flex;
    flex-direction: column;
    gap: ${({spacing:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.textPrimary};
    caret-color: ${({tokens:e})=>e.core.textAccentPrimary};
  }

  .wui-input-text-container {
    position: relative;
    display: flex;
  }

  input {
    width: 100%;
    border-radius: ${({borderRadius:e})=>e[4]};
    color: inherit;
    background: transparent;
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
    caret-color: ${({tokens:e})=>e.core.textAccentPrimary};
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[3]} ${({spacing:e})=>e[10]};
    font-size: ${({textSize:e})=>e.large};
    line-height: ${({typography:e})=>e["lg-regular"].lineHeight};
    letter-spacing: ${({typography:e})=>e["lg-regular"].letterSpacing};
    font-weight: ${({fontWeight:e})=>e.regular};
    font-family: ${({fontFamily:e})=>e.regular};
  }

  input[data-size='lg'] {
    padding: ${({spacing:e})=>e[4]} ${({spacing:e})=>e[3]}
      ${({spacing:e})=>e[4]} ${({spacing:e})=>e[10]};
  }

  @media (hover: hover) and (pointer: fine) {
    input:hover:enabled {
      border: 1px solid ${({tokens:e})=>e.theme.borderSecondary};
    }
  }

  input:disabled {
    cursor: unset;
    border: 1px solid ${({tokens:e})=>e.theme.borderPrimary};
  }

  input::placeholder {
    color: ${({tokens:e})=>e.theme.textSecondary};
  }

  input:focus:enabled {
    border: 1px solid ${({tokens:e})=>e.theme.borderSecondary};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    -webkit-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
    -moz-box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
    box-shadow: 0px 0px 0px 4px ${({tokens:e})=>e.core.foregroundAccent040};
  }

  div.wui-input-text-container:has(input:disabled) {
    opacity: 0.5;
  }

  wui-icon.wui-input-text-left-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
    left: ${({spacing:e})=>e[4]};
    color: ${({tokens:e})=>e.theme.iconDefault};
  }

  button.wui-input-text-submit-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:e})=>e[3]};
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: ${({borderRadius:e})=>e[2]};
    color: ${({tokens:e})=>e.core.textAccentPrimary};
  }

  button.wui-input-text-submit-button:disabled {
    opacity: 1;
  }

  button.wui-input-text-submit-button.loading wui-icon {
    animation: spin 1s linear infinite;
  }

  button.wui-input-text-submit-button:hover {
    background: ${({tokens:e})=>e.core.foregroundAccent010};
  }

  input:has(+ .wui-input-text-submit-button) {
    padding-right: ${({spacing:e})=>e[12]};
  }

  input[type='number'] {
    -moz-appearance: textfield;
  }

  input[type='search']::-webkit-search-decoration,
  input[type='search']::-webkit-search-cancel-button,
  input[type='search']::-webkit-search-results-button,
  input[type='search']::-webkit-search-results-decoration {
    -webkit-appearance: none;
  }

  /* -- Keyframes --------------------------------------------------- */
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;var Y=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let V=class extends D{constructor(){super(...arguments),this.inputElementRef=Dt(),this.disabled=!1,this.loading=!1,this.placeholder="",this.type="text",this.value="",this.size="md"}render(){return u` <div class="wui-input-text-container">
        ${this.templateLeftIcon()}
        <input
          data-size=${this.size}
          ${jt(this.inputElementRef)}
          data-testid="wui-input-text"
          type=${this.type}
          enterkeyhint=${j(this.enterKeyHint)}
          ?disabled=${this.disabled}
          placeholder=${this.placeholder}
          @input=${this.dispatchInputChangeEvent.bind(this)}
          @keydown=${this.onKeyDown}
          .value=${this.value||""}
        />
        ${this.templateSubmitButton()}
        <slot class="wui-input-text-slot"></slot>
      </div>
      ${this.templateError()} ${this.templateWarning()}`}templateLeftIcon(){return this.icon?u`<wui-icon
        class="wui-input-text-left-icon"
        size="md"
        data-size=${this.size}
        color="inherit"
        name=${this.icon}
      ></wui-icon>`:null}templateSubmitButton(){return this.onSubmit?u`<button
        class="wui-input-text-submit-button ${this.loading?"loading":""}"
        @click=${this.onSubmit?.bind(this)}
        ?disabled=${this.disabled||this.loading}
      >
        ${this.loading?u`<wui-icon name="spinner" size="md"></wui-icon>`:u`<wui-icon name="chevronRight" size="md"></wui-icon>`}
      </button>`:null}templateError(){return this.errorText?u`<wui-text variant="sm-regular" color="error">${this.errorText}</wui-text>`:null}templateWarning(){return this.warningText?u`<wui-text variant="sm-regular" color="warning">${this.warningText}</wui-text>`:null}dispatchInputChangeEvent(){this.dispatchEvent(new CustomEvent("inputChange",{detail:this.inputElementRef.value?.value,bubbles:!0,composed:!0}))}};V.styles=[J,me,Yi];Y([d()],V.prototype,"icon",void 0);Y([d({type:Boolean})],V.prototype,"disabled",void 0);Y([d({type:Boolean})],V.prototype,"loading",void 0);Y([d()],V.prototype,"placeholder",void 0);Y([d()],V.prototype,"type",void 0);Y([d()],V.prototype,"value",void 0);Y([d()],V.prototype,"errorText",void 0);Y([d()],V.prototype,"warningText",void 0);Y([d()],V.prototype,"onSubmit",void 0);Y([d()],V.prototype,"size",void 0);Y([d({attribute:!1})],V.prototype,"onKeyDown",void 0);V=Y([O("wui-input-text")],V);const Xi=U`
  :host {
    position: relative;
    display: inline-block;
    width: 100%;
  }

  wui-icon {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    right: ${({spacing:e})=>e[3]};
    color: ${({tokens:e})=>e.theme.iconDefault};
    cursor: pointer;
    padding: ${({spacing:e})=>e[2]};
    background-color: transparent;
    border-radius: ${({borderRadius:e})=>e[4]};
    transition: background-color ${({durations:e})=>e.lg}
      ${({easings:e})=>e["ease-out-power-2"]};
  }

  @media (hover: hover) {
    wui-icon:hover {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }
`;var zn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let et=class extends D{constructor(){super(...arguments),this.inputComponentRef=Dt(),this.inputValue=""}render(){return u`
      <wui-input-text
        ${jt(this.inputComponentRef)}
        placeholder="Search wallet"
        icon="search"
        type="search"
        enterKeyHint="search"
        size="sm"
        @inputChange=${this.onInputChange}
      >
        ${this.inputValue?u`<wui-icon
              @click=${this.clearValue}
              color="inherit"
              size="sm"
              name="close"
            ></wui-icon>`:null}
      </wui-input-text>
    `}onInputChange(t){this.inputValue=t.detail||""}clearValue(){const i=this.inputComponentRef.value?.inputElementRef.value;i&&(i.value="",this.inputValue="",i.focus(),i.dispatchEvent(new Event("input")))}};et.styles=[J,Xi];zn([d()],et.prototype,"inputValue",void 0);et=zn([O("wui-search-bar")],et);const Zi=Oe`<svg  viewBox="0 0 48 54" fill="none">
  <path
    d="M43.4605 10.7248L28.0485 1.61089C25.5438 0.129705 22.4562 0.129705 19.9515 1.61088L4.53951 10.7248C2.03626 12.2051 0.5 14.9365 0.5 17.886V36.1139C0.5 39.0635 2.03626 41.7949 4.53951 43.2752L19.9515 52.3891C22.4562 53.8703 25.5438 53.8703 28.0485 52.3891L43.4605 43.2752C45.9637 41.7949 47.5 39.0635 47.5 36.114V17.8861C47.5 14.9365 45.9637 12.2051 43.4605 10.7248Z"
  />
</svg>`,er=U`
  :host {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 104px;
    width: 104px;
    row-gap: ${({spacing:e})=>e[2]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: ${({borderRadius:e})=>e[5]};
    position: relative;
  }

  wui-shimmer[data-type='network'] {
    border: none;
    -webkit-clip-path: var(--apkt-path-network);
    clip-path: var(--apkt-path-network);
  }

  svg {
    position: absolute;
    width: 48px;
    height: 54px;
    z-index: 1;
  }

  svg > path {
    stroke: ${({tokens:e})=>e.theme.foregroundSecondary};
    stroke-width: 1px;
  }

  @media (max-width: 350px) {
    :host {
      width: 100%;
    }
  }
`;var qn=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let tt=class extends D{constructor(){super(...arguments),this.type="wallet"}render(){return u`
      ${this.shimmerTemplate()}
      <wui-shimmer width="80px" height="20px"></wui-shimmer>
    `}shimmerTemplate(){return this.type==="network"?u` <wui-shimmer data-type=${this.type} width="48px" height="54px"></wui-shimmer>
        ${Zi}`:u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}};tt.styles=[J,me,er];qn([d()],tt.prototype,"type",void 0);tt=qn([O("wui-card-select-loader")],tt);const tr=An`
  :host {
    display: grid;
    width: inherit;
    height: inherit;
  }
`;var X=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let K=class extends D{render(){return this.style.cssText=`
      grid-template-rows: ${this.gridTemplateRows};
      grid-template-columns: ${this.gridTemplateColumns};
      justify-items: ${this.justifyItems};
      align-items: ${this.alignItems};
      justify-content: ${this.justifyContent};
      align-content: ${this.alignContent};
      column-gap: ${this.columnGap&&`var(--apkt-spacing-${this.columnGap})`};
      row-gap: ${this.rowGap&&`var(--apkt-spacing-${this.rowGap})`};
      gap: ${this.gap&&`var(--apkt-spacing-${this.gap})`};
      padding-top: ${this.padding&&ce.getSpacingStyles(this.padding,0)};
      padding-right: ${this.padding&&ce.getSpacingStyles(this.padding,1)};
      padding-bottom: ${this.padding&&ce.getSpacingStyles(this.padding,2)};
      padding-left: ${this.padding&&ce.getSpacingStyles(this.padding,3)};
      margin-top: ${this.margin&&ce.getSpacingStyles(this.margin,0)};
      margin-right: ${this.margin&&ce.getSpacingStyles(this.margin,1)};
      margin-bottom: ${this.margin&&ce.getSpacingStyles(this.margin,2)};
      margin-left: ${this.margin&&ce.getSpacingStyles(this.margin,3)};
    `,u`<slot></slot>`}};K.styles=[J,tr];X([d()],K.prototype,"gridTemplateRows",void 0);X([d()],K.prototype,"gridTemplateColumns",void 0);X([d()],K.prototype,"justifyItems",void 0);X([d()],K.prototype,"alignItems",void 0);X([d()],K.prototype,"justifyContent",void 0);X([d()],K.prototype,"alignContent",void 0);X([d()],K.prototype,"columnGap",void 0);X([d()],K.prototype,"rowGap",void 0);X([d()],K.prototype,"gap",void 0);X([d()],K.prototype,"padding",void 0);X([d()],K.prototype,"margin",void 0);K=X([O("wui-grid")],K);const nr=U`
  button {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    width: 104px;
    row-gap: ${({spacing:e})=>e[2]};
    padding: ${({spacing:e})=>e[3]} ${({spacing:e})=>e[0]};
    background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    border-radius: clamp(0px, ${({borderRadius:e})=>e[4]}, 20px);
    transition:
      color ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-1"]},
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]},
      border-radius ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-1"]};
    will-change: background-color, color, border-radius;
    outline: none;
    border: none;
  }

  button > wui-flex > wui-text {
    color: ${({tokens:e})=>e.theme.textPrimary};
    max-width: 86px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    justify-content: center;
  }

  button > wui-flex > wui-text.certified {
    max-width: 66px;
  }

  @media (hover: hover) and (pointer: fine) {
    button:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundSecondary};
    }
  }

  button:disabled > wui-flex > wui-text {
    color: ${({tokens:e})=>e.core.glass010};
  }

  [data-selected='true'] {
    background-color: ${({colors:e})=>e.accent020};
  }

  @media (hover: hover) and (pointer: fine) {
    [data-selected='true']:hover:enabled {
      background-color: ${({colors:e})=>e.accent010};
    }
  }

  [data-selected='true']:active:enabled {
    background-color: ${({colors:e})=>e.accent010};
  }

  @media (max-width: 350px) {
    button {
      width: 100%;
    }
  }
`;var re=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let G=class extends D{constructor(){super(),this.observer=new IntersectionObserver(()=>{}),this.visible=!1,this.imageSrc=void 0,this.imageLoading=!1,this.isImpressed=!1,this.explorerId="",this.walletQuery="",this.certified=!1,this.displayIndex=0,this.wallet=void 0,this.observer=new IntersectionObserver(t=>{t.forEach(i=>{i.isIntersecting?(this.visible=!0,this.fetchImageSrc(),this.sendImpressionEvent()):this.visible=!1})},{threshold:.01})}firstUpdated(){this.observer.observe(this)}disconnectedCallback(){this.observer.disconnect()}render(){const t=this.wallet?.badge_type==="certified";return u`
      <button>
        ${this.imageTemplate()}
        <wui-flex flexDirection="row" alignItems="center" justifyContent="center" gap="1">
          <wui-text
            variant="md-regular"
            color="inherit"
            class=${j(t?"certified":void 0)}
            >${this.wallet?.name}</wui-text
          >
          ${t?u`<wui-icon size="sm" name="walletConnectBrown"></wui-icon>`:null}
        </wui-flex>
      </button>
    `}imageTemplate(){return!this.visible&&!this.imageSrc||this.imageLoading?this.shimmerTemplate():u`
      <wui-wallet-image
        size="lg"
        imageSrc=${j(this.imageSrc)}
        name=${j(this.wallet?.name)}
        .installed=${this.wallet?.installed??!1}
        badgeSize="sm"
      >
      </wui-wallet-image>
    `}shimmerTemplate(){return u`<wui-shimmer width="56px" height="56px"></wui-shimmer>`}async fetchImageSrc(){this.wallet&&(this.imageSrc=ge.getWalletImage(this.wallet),!this.imageSrc&&(this.imageLoading=!0,this.imageSrc=await ge.fetchWalletImage(this.wallet.image_id),this.imageLoading=!1))}sendImpressionEvent(){!this.wallet||this.isImpressed||(this.isImpressed=!0,F.sendWalletImpressionEvent({name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.explorerId,view:B.state.view,query:this.walletQuery,certified:this.certified,displayIndex:this.displayIndex}))}};G.styles=nr;re([_()],G.prototype,"visible",void 0);re([_()],G.prototype,"imageSrc",void 0);re([_()],G.prototype,"imageLoading",void 0);re([_()],G.prototype,"isImpressed",void 0);re([d()],G.prototype,"explorerId",void 0);re([d()],G.prototype,"walletQuery",void 0);re([d()],G.prototype,"certified",void 0);re([d()],G.prototype,"displayIndex",void 0);re([d({type:Object})],G.prototype,"wallet",void 0);G=re([O("w3m-all-wallets-list-item")],G);const ir=U`
  wui-grid {
    max-height: clamp(360px, 400px, 80vh);
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  w3m-all-wallets-list-item {
    opacity: 0;
    animation-duration: ${({durations:e})=>e.xl};
    animation-timing-function: ${({easings:e})=>e["ease-inout-power-2"]};
    animation-name: fade-in;
    animation-fill-mode: forwards;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  wui-loading-spinner {
    padding-top: ${({spacing:e})=>e[4]};
    padding-bottom: ${({spacing:e})=>e[4]};
    justify-content: center;
    grid-column: 1 / span 4;
  }
`;var be=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};const Rn="local-paginator";let ie=class extends D{constructor(){super(),this.unsubscribe=[],this.paginationObserver=void 0,this.loading=!N.state.wallets.length,this.wallets=N.state.wallets,this.recommended=N.state.recommended,this.featured=N.state.featured,this.filteredWallets=N.state.filteredWallets,this.mobileFullScreen=q.state.enableMobileFullScreen,this.unsubscribe.push(N.subscribeKey("wallets",t=>this.wallets=t),N.subscribeKey("recommended",t=>this.recommended=t),N.subscribeKey("featured",t=>this.featured=t),N.subscribeKey("filteredWallets",t=>this.filteredWallets=t))}firstUpdated(){this.initialFetch(),this.createPaginationObserver()}disconnectedCallback(){this.unsubscribe.forEach(t=>t()),this.paginationObserver?.disconnect()}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),u`
      <wui-grid
        data-scroll=${!this.loading}
        .padding=${["0","3","3","3"]}
        gap="2"
        justifyContent="space-between"
      >
        ${this.loading?this.shimmerTemplate(16):this.walletsTemplate()}
        ${this.paginationLoaderTemplate()}
      </wui-grid>
    `}async initialFetch(){this.loading=!0;const t=this.shadowRoot?.querySelector("wui-grid");t&&(await N.fetchWalletsByPage({page:1}),await t.animate([{opacity:1},{opacity:0}],{duration:200,fill:"forwards",easing:"ease"}).finished,this.loading=!1,t.animate([{opacity:0},{opacity:1}],{duration:200,fill:"forwards",easing:"ease"}))}shimmerTemplate(t,i){return[...Array(t)].map(()=>u`
        <wui-card-select-loader type="wallet" id=${j(i)}></wui-card-select-loader>
      `)}getWallets(){const t=[...this.featured,...this.recommended];this.filteredWallets?.length>0?t.push(...this.filteredWallets):t.push(...this.wallets);const i=L.uniqueBy(t,"id"),r=Pt.markWalletsAsInstalled(i);return Pt.markWalletsWithDisplayIndex(r)}walletsTemplate(){return this.getWallets().map((i,r)=>u`
        <w3m-all-wallets-list-item
          data-testid="wallet-search-item-${i.id}"
          @click=${()=>this.onConnectWallet(i)}
          .wallet=${i}
          explorerId=${i.id}
          certified=${this.badge==="certified"}
          displayIndex=${r}
        ></w3m-all-wallets-list-item>
      `)}paginationLoaderTemplate(){const{wallets:t,recommended:i,featured:r,count:o,mobileFilteredOutWalletsLength:n}=N.state,s=window.innerWidth<352?3:4,a=t.length+i.length;let c=Math.ceil(a/s)*s-a+s;return c-=t.length?r.length%s:0,o===0&&r.length>0?null:o===0||[...r,...t,...i].length<o-(n??0)?this.shimmerTemplate(c,Rn):null}createPaginationObserver(){const t=this.shadowRoot?.querySelector(`#${Rn}`);t&&(this.paginationObserver=new IntersectionObserver(([i])=>{if(i?.isIntersecting&&!this.loading){const{page:r,count:o,wallets:n}=N.state;n.length<o&&N.fetchWalletsByPage({page:r+1})}}),this.paginationObserver.observe(t))}onConnectWallet(t){H.selectWalletConnector(t)}};ie.styles=ir;be([_()],ie.prototype,"loading",void 0);be([_()],ie.prototype,"wallets",void 0);be([_()],ie.prototype,"recommended",void 0);be([_()],ie.prototype,"featured",void 0);be([_()],ie.prototype,"filteredWallets",void 0);be([_()],ie.prototype,"badge",void 0);be([_()],ie.prototype,"mobileFullScreen",void 0);ie=be([O("w3m-all-wallets-list")],ie);const rr=An`
  wui-grid,
  wui-loading-spinner,
  wui-flex {
    height: 360px;
  }

  wui-grid {
    overflow: scroll;
    scrollbar-width: none;
    grid-auto-rows: min-content;
    grid-template-columns: repeat(auto-fill, 104px);
  }

  :host([data-mobile-fullscreen='true']) wui-grid {
    max-height: none;
    height: auto;
  }

  wui-grid[data-scroll='false'] {
    overflow: hidden;
  }

  wui-grid::-webkit-scrollbar {
    display: none;
  }

  wui-loading-spinner {
    justify-content: center;
    align-items: center;
  }

  @media (max-width: 350px) {
    wui-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
`;var qe=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Re=class extends D{constructor(){super(...arguments),this.prevQuery="",this.prevBadge=void 0,this.loading=!0,this.mobileFullScreen=q.state.enableMobileFullScreen,this.query=""}render(){return this.mobileFullScreen&&this.setAttribute("data-mobile-fullscreen","true"),this.onSearch(),this.loading?u`<wui-loading-spinner color="accent-primary"></wui-loading-spinner>`:this.walletsTemplate()}async onSearch(){(this.query.trim()!==this.prevQuery.trim()||this.badge!==this.prevBadge)&&(this.prevQuery=this.query,this.prevBadge=this.badge,this.loading=!0,await N.searchWallet({search:this.query,badge:this.badge}),this.loading=!1)}walletsTemplate(){const{search:t}=N.state,i=Pt.markWalletsAsInstalled(t);return t.length?u`
      <wui-grid
        data-testid="wallet-list"
        .padding=${["0","3","3","3"]}
        rowGap="4"
        columngap="2"
        justifyContent="space-between"
      >
        ${i.map((r,o)=>u`
            <w3m-all-wallets-list-item
              @click=${()=>this.onConnectWallet(r)}
              .wallet=${r}
              data-testid="wallet-search-item-${r.id}"
              explorerId=${r.id}
              certified=${this.badge==="certified"}
              walletQuery=${this.query}
              displayIndex=${o}
            ></w3m-all-wallets-list-item>
          `)}
      </wui-grid>
    `:u`
        <wui-flex
          data-testid="no-wallet-found"
          justifyContent="center"
          alignItems="center"
          gap="3"
          flexDirection="column"
        >
          <wui-icon-box size="lg" color="default" icon="wallet"></wui-icon-box>
          <wui-text data-testid="no-wallet-found-text" color="secondary" variant="md-medium">
            No Wallet found
          </wui-text>
        </wui-flex>
      `}onConnectWallet(t){H.selectWalletConnector(t)}};Re.styles=rr;qe([_()],Re.prototype,"loading",void 0);qe([_()],Re.prototype,"mobileFullScreen",void 0);qe([d()],Re.prototype,"query",void 0);qe([d()],Re.prototype,"badge",void 0);Re=qe([O("w3m-all-wallets-search")],Re);var Ut=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let nt=class extends D{constructor(){super(...arguments),this.search="",this.badge=void 0,this.onDebouncedSearch=L.debounce(t=>{this.search=t})}render(){const t=this.search.length>=2;return u`
      <wui-flex .padding=${["1","3","3","3"]} gap="2" alignItems="center">
        <wui-search-bar @inputChange=${this.onInputChange.bind(this)}></wui-search-bar>
        <wui-certified-switch
          ?checked=${this.badge==="certified"}
          @certifiedSwitchChange=${this.onCertifiedSwitchChange.bind(this)}
          data-testid="wui-certified-switch"
        ></wui-certified-switch>
        ${this.qrButtonTemplate()}
      </wui-flex>
      ${t||this.badge?u`<w3m-all-wallets-search
            query=${this.search}
            .badge=${this.badge}
          ></w3m-all-wallets-search>`:u`<w3m-all-wallets-list .badge=${this.badge}></w3m-all-wallets-list>`}
    `}onInputChange(t){this.onDebouncedSearch(t.detail)}onCertifiedSwitchChange(t){t.detail?(this.badge="certified",De.showSvg("Only WalletConnect certified",{icon:"walletConnectBrown",iconColor:"accent-100"})):this.badge=void 0}qrButtonTemplate(){return L.isMobile()?u`
        <wui-icon-box
          size="xl"
          iconSize="xl"
          color="accent-primary"
          icon="qrCode"
          border
          borderColor="wui-accent-glass-010"
          @click=${this.onWalletConnectQr.bind(this)}
        ></wui-icon-box>
      `:null}onWalletConnectQr(){B.push("ConnectingWalletConnect")}};Ut([_()],nt.prototype,"search",void 0);Ut([_()],nt.prototype,"badge",void 0);nt=Ut([O("w3m-all-wallets-view")],nt);const or=U`
  :host {
    width: 100%;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: ${({spacing:e})=>e[3]};
    width: 100%;
    background-color: ${({tokens:e})=>e.theme.backgroundPrimary};
    border-radius: ${({borderRadius:e})=>e[4]};
    transition:
      background-color ${({durations:e})=>e.lg}
        ${({easings:e})=>e["ease-out-power-2"]},
      scale ${({durations:e})=>e.lg} ${({easings:e})=>e["ease-out-power-2"]};
    will-change: background-color, scale;
  }

  wui-text {
    text-transform: capitalize;
  }

  wui-image {
    color: ${({tokens:e})=>e.theme.textPrimary};
  }

  @media (hover: hover) {
    button:hover:enabled {
      background-color: ${({tokens:e})=>e.theme.foregroundPrimary};
    }
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;var oe=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Q=class extends D{constructor(){super(...arguments),this.imageSrc="google",this.loading=!1,this.disabled=!1,this.rightIcon=!0,this.rounded=!1,this.fullSize=!1}render(){return this.dataset.rounded=this.rounded?"true":"false",u`
      <button
        ?disabled=${this.loading?!0:!!this.disabled}
        data-loading=${this.loading}
        tabindex=${j(this.tabIdx)}
      >
        <wui-flex gap="2" alignItems="center">
          ${this.templateLeftIcon()}
          <wui-flex gap="1">
            <slot></slot>
          </wui-flex>
        </wui-flex>
        ${this.templateRightIcon()}
      </button>
    `}templateLeftIcon(){return this.icon?u`<wui-image
        icon=${this.icon}
        iconColor=${j(this.iconColor)}
        ?boxed=${!0}
        ?rounded=${this.rounded}
      ></wui-image>`:u`<wui-image
      ?boxed=${!0}
      ?rounded=${this.rounded}
      ?fullSize=${this.fullSize}
      src=${this.imageSrc}
    ></wui-image>`}templateRightIcon(){return this.rightIcon?this.loading?u`<wui-loading-spinner size="md" color="accent-primary"></wui-loading-spinner>`:u`<wui-icon name="chevronRight" size="lg" color="default"></wui-icon>`:null}};Q.styles=[J,me,or];oe([d()],Q.prototype,"imageSrc",void 0);oe([d()],Q.prototype,"icon",void 0);oe([d()],Q.prototype,"iconColor",void 0);oe([d({type:Boolean})],Q.prototype,"loading",void 0);oe([d()],Q.prototype,"tabIdx",void 0);oe([d({type:Boolean})],Q.prototype,"disabled",void 0);oe([d({type:Boolean})],Q.prototype,"rightIcon",void 0);oe([d({type:Boolean})],Q.prototype,"rounded",void 0);oe([d({type:Boolean})],Q.prototype,"fullSize",void 0);Q=oe([O("wui-list-item")],Q);var sr=function(e,t,i,r){var o=arguments.length,n=o<3?t:r===null?r=Object.getOwnPropertyDescriptor(t,i):r,s;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")n=Reflect.decorate(e,t,i,r);else for(var a=e.length-1;a>=0;a--)(s=e[a])&&(n=(o<3?s(n):o>3?s(t,i,n):s(t,i))||n);return o>3&&n&&Object.defineProperty(t,i,n),n};let Sn=class extends D{constructor(){super(...arguments),this.wallet=B.state.data?.wallet}render(){if(!this.wallet)throw new Error("w3m-downloads-view");return u`
      <wui-flex gap="2" flexDirection="column" .padding=${["3","3","4","3"]}>
        ${this.chromeTemplate()} ${this.iosTemplate()} ${this.androidTemplate()}
        ${this.homepageTemplate()}
      </wui-flex>
    `}chromeTemplate(){return this.wallet?.chrome_store?u`<wui-list-item
      variant="icon"
      icon="chromeStore"
      iconVariant="square"
      @click=${this.onChromeStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Chrome Extension</wui-text>
    </wui-list-item>`:null}iosTemplate(){return this.wallet?.app_store?u`<wui-list-item
      variant="icon"
      icon="appStore"
      iconVariant="square"
      @click=${this.onAppStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">iOS App</wui-text>
    </wui-list-item>`:null}androidTemplate(){return this.wallet?.play_store?u`<wui-list-item
      variant="icon"
      icon="playStore"
      iconVariant="square"
      @click=${this.onPlayStore.bind(this)}
      chevron
    >
      <wui-text variant="md-medium" color="primary">Android App</wui-text>
    </wui-list-item>`:null}homepageTemplate(){return this.wallet?.homepage?u`
      <wui-list-item
        variant="icon"
        icon="browser"
        iconVariant="square-blue"
        @click=${this.onHomePage.bind(this)}
        chevron
      >
        <wui-text variant="md-medium" color="primary">Website</wui-text>
      </wui-list-item>
    `:null}openStore(t){t.href&&this.wallet&&(F.sendEvent({type:"track",event:"GET_WALLET",properties:{name:this.wallet.name,walletRank:this.wallet.order,explorerId:this.wallet.id,type:t.type}}),L.openHref(t.href,"_blank"))}onChromeStore(){this.wallet?.chrome_store&&this.openStore({href:this.wallet.chrome_store,type:"chrome_store"})}onAppStore(){this.wallet?.app_store&&this.openStore({href:this.wallet.app_store,type:"app_store"})}onPlayStore(){this.wallet?.play_store&&this.openStore({href:this.wallet.play_store,type:"play_store"})}onHomePage(){this.wallet?.homepage&&this.openStore({href:this.wallet.homepage,type:"homepage"})}};Sn=sr([O("w3m-downloads-view")],Sn);export{nt as W3mAllWalletsView,Ye as W3mConnectingWcBasicView,Sn as W3mDownloadsView};
