export interface CatInfo {
  id: string;
  name: string;
}

export const CATS: CatInfo[] = [
  { id: "kuro", name: "黑猫" },
  { id: "mugi", name: "橘猫" },
  { id: "hana", name: "三花猫" },
  { id: "shiro", name: "白猫" },
  { id: "saba", name: "银虎斑" },
  { id: "hachi", name: "奶牛猫" },
  { id: "sabi", name: "玳瑁猫" },
  { id: "gray", name: "蓝灰猫" },
  { id: "kiji", name: "狸花猫" },
  { id: "siam", name: "暹罗猫" },
  { id: "ragdoll", name: "布偶猫" },
  { id: "siberian", name: "西伯利亚猫" },
  { id: "norwegian", name: "挪威森林猫" },
];

export const assetUrl = (name: string) => `/assets/${name}.webp`;
