/** The css rule classes told apart by name: `instanceof` fails across windows. */
export interface RuleKinds {
  CSSStyleRule: CSSStyleRule;
  CSSNestedDeclarations: CSSNestedDeclarations;
  CSSImportRule: CSSImportRule;
  CSSMediaRule: CSSMediaRule;
  CSSSupportsRule: CSSSupportsRule;
  CSSContainerRule: CSSContainerRule;
  CSSLayerBlockRule: CSSLayerBlockRule;
  CSSLayerStatementRule: CSSLayerStatementRule;
  CSSScopeRule: CSSScopeRule;
  CSSPropertyRule: CSSPropertyRule;
}

/** Is `rule` of the class named `kind`, from whichever window it was made in? */
export function isKind<K extends keyof RuleKinds>(rule: CSSRule, kind: K): rule is RuleKinds[K] {
  return rule.constructor.name === kind;
}
