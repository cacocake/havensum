import React, { useContext } from 'react';
import { View } from 'react-native';
import { euro } from './money.js';
import { Field, H, Select, T, Theme } from './ui.jsx';

export default function MissingCategoryReview({ rows, categories, edits, onChange }) {
  const colors = useContext(Theme);
  if (!rows.length) {
    return null;
  }
  const options = [{ label: 'Uncategorized', value: '' }, ...categories.map(category => ({
    label: category.name,
    value: JSON.stringify(category.id)
  }))];
  return (
    <View style={{ gap: 12, marginBottom: 20 }}>
      <H size={21}>Missing categories</H>
      <T>Choose a category for each affected transaction or keep it uncategorized.</T>
      {rows.map(({ transaction, categoryId }) => {
        const key = JSON.stringify(transaction.id);
        const edit = edits[key];
        return (
          <View key={key} style={{ padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12, gap: 8 }}>
            <T>{transaction.date} · {euro(transaction.amount)}</T>
            <T style={{ color: colors.sub }}>Missing category · {categoryId}</T>
            <Field label={`Name for ${transaction.title}`} value={edit?.title ?? transaction.title} onChangeText={title => onChange(key, { title })} />
            <Select label={`Category for ${transaction.title}`} options={options}
              value={edit?.category ?? ''} onChange={category => onChange(key, { category })} />
          </View>
        );
      })}
    </View>
  );
}
