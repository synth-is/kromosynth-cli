import json
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import networkx as nx
import plotly.graph_objects as go
import plotly.express as px
import pandas as pd
from pathlib import Path

# for analyzing the evolution of dynamic feature-index sets (which were selected based on their information/variance contribution)

class FeatureEvolutionAnalyzer:
    def __init__(self, json_path):
        with open(json_path) as f:
            self.data = json.load(f)["0"]
        self.process_data()

    def process_data(self):
        self.generations = []
        self.feature_counts = []
        self.avg_contributions = []
        self.contribution_spreads = []
        self.feature_matrix = []
        
        self.max_feature_index = max(
            max(gen_data['feature_indices'])
            for gen, gen_data in self.data.items()
            if gen != 'eliteMapIndex'
        )
        
        for gen, gen_data in sorted(self.data.items(), key=lambda x: int(x[0])):
            if gen == 'eliteMapIndex':
                continue
                
            gen_num = int(gen)
            indices = gen_data['feature_indices']
            contributions = [gen_data['feature_contribution'][i] for i in indices]
            
            self.generations.append(gen_num)
            self.feature_counts.append(len(indices))
            self.avg_contributions.append(np.mean(contributions))
            self.contribution_spreads.append(np.max(contributions) - np.min(contributions))
            
            selected = np.zeros(self.max_feature_index + 1)
            selected[indices] = contributions  # Store contribution values instead of binary
            self.feature_matrix.append(selected)

    def plot_evolution_metrics(self, save_path=None):
        plt.figure(figsize=(10, 6))
        plt.plot(self.generations, self.feature_counts, 
                label='Number of Features', color='#4285f4')
        plt.plot(self.generations, self.avg_contributions, 
                label='Average Contribution', color='#34a853')
        plt.plot(self.generations, self.contribution_spreads, 
                label='Contribution Spread', color='#ea4335')
        
        plt.xlabel('Generation')
        plt.ylabel('Value')
        plt.title('Feature Selection Evolution')
        plt.grid(True, linestyle='--', alpha=0.7)
        plt.legend()
        
        if save_path:
            plt.savefig(save_path, bbox_inches='tight', dpi=300)
            plt.close()
        return plt.gcf()

    def plot_feature_retention_heatmap(self, save_path=None):
        plt.figure(figsize=(12, 8))
        sns.heatmap(self.feature_matrix, cmap='viridis',
                  xticklabels='auto', 
                  yticklabels=self.generations[::50])
        plt.xlabel('Feature Index')
        plt.ylabel('Generation')
        plt.title('Feature Retention Across Generations')
        
        if save_path:
            plt.savefig(save_path, bbox_inches='tight', dpi=300)
            plt.close()
        return plt.gcf()

    def plot_contribution_distributions(self, sample_gens=None, save_path=None):
        if sample_gens is None:
            all_gens = sorted([int(g) for g in self.data.keys() if g != 'eliteMapIndex'])
            indices = np.linspace(0, len(all_gens)-1, 5).astype(int)
            sample_gens = [all_gens[i] for i in indices]
        
        contributions = []
        for gen in sample_gens:
            gen_str = str(gen)
            indices = self.data[gen_str]['feature_indices']
            gen_contributions = [self.data[gen_str]['feature_contribution'][i] for i in indices]
            contributions.append(gen_contributions)
        
        plt.figure(figsize=(10, 6))
        plt.violinplot(contributions)
        plt.xticks(range(1, len(sample_gens) + 1), [f'Gen {g}' for g in sample_gens])
        plt.xlabel('Generation')
        plt.ylabel('Feature Contribution')
        plt.title('Feature Contribution Distributions')
        
        if save_path:
            plt.savefig(save_path, bbox_inches='tight', dpi=300)
            plt.close()
        return plt.gcf()

    def plot_coselection_network(self, min_cooccurrence=0.5, save_path=None):
        cooccurrence = np.zeros((self.max_feature_index + 1, self.max_feature_index + 1))
        
        for gen_data in self.data.values():
            if isinstance(gen_data, dict) and 'feature_indices' in gen_data:
                indices = gen_data['feature_indices']
                for i in indices:
                    for j in indices:
                        cooccurrence[i,j] += 1
        
        threshold = min_cooccurrence * len(self.generations)
        G = nx.from_numpy_array(cooccurrence > threshold)
        
        plt.figure(figsize=(12, 12))
        pos = nx.spring_layout(G)
        nx.draw(G, pos, with_labels=True, node_color='#4285f4',
              node_size=500, font_size=8, font_color='white')
        plt.title('Feature Co-selection Network')
        
        if save_path:
            plt.savefig(save_path, bbox_inches='tight', dpi=300)
            plt.close()
        return plt.gcf()

    def plot_sankey(self, sample_gens=None, max_features=20, save_path=None):
        if sample_gens is None:
            all_gens = sorted([int(g) for g in self.data.keys() if g != 'eliteMapIndex'])
            indices = np.linspace(0, len(all_gens)-1, 5).astype(int)
            sample_gens = [all_gens[i] for i in indices]
        
        nodes, links = [], []
        node_indices = {}
        current_idx = 0
        
        for i in range(len(sample_gens) - 1):
            gen1, gen2 = str(sample_gens[i]), str(sample_gens[i+1])
            features1 = self.data[gen1]['feature_indices'][:max_features]
            features2 = self.data[gen2]['feature_indices'][:max_features]
            
            for f in features1 + features2:
                for gen in [gen1, gen2]:
                    label = f'Gen{gen}_F{f}'
                    if label not in node_indices:
                        node_indices[label] = current_idx
                        nodes.append(label)
                        current_idx += 1
            
            for f1 in features1:
                for f2 in features2:
                    if f1 == f2:
                        links.append({
                            'source': node_indices[f'Gen{gen1}_F{f1}'],
                            'target': node_indices[f'Gen{gen2}_F{f2}'],
                            'value': 1
                        })
        
        fig = go.Figure(data=[go.Sankey(
            node=dict(pad=15, thickness=20, line=dict(color="black", width=0.5),
                     label=nodes, color="blue"),
            link=dict(source=[link['source'] for link in links],
                     target=[link['target'] for link in links],
                     value=[link['value'] for link in links])
        )])
        
        if save_path:
            fig.write_image(save_path)
        return fig

    def plot_alluvial(self, sample_gens=None, max_features=15, save_path=None):
        if sample_gens is None:
            all_gens = sorted([int(g) for g in self.data.keys() if g != 'eliteMapIndex'])
            indices = np.linspace(0, len(all_gens)-1, 4).astype(int)
            sample_gens = [all_gens[i] for i in indices]
        
        df_records = []
        for gen in sample_gens:
            gen_str = str(gen)
            indices = self.data[gen_str]['feature_indices']
            contributions = [self.data[gen_str]['feature_contribution'][i] for i in indices]
            features = indices[:max_features]
            feature_contribs = contributions[:max_features]
            
            for f, c in zip(features, feature_contribs):
                df_records.append({
                    'Generation': f'Gen_{gen}',
                    'Feature': f'Feature_{f}',
                    'Contribution': c
                })
        
        df = pd.DataFrame(df_records)
        fig = px.parallel_categories(df, 
                                  dimensions=['Generation', 'Feature'],
                                  color='Contribution',
                                  color_continuous_scale='Viridis')
        
        if save_path:
            fig.write_image(save_path)
        return fig

    def plot_bump_chart(self, sample_gens=None, max_features=10, save_path=None):
      if sample_gens is None:
          all_gens = sorted([int(g) for g in self.data.keys() if g != 'eliteMapIndex'])
          sample_gens = all_gens[::len(all_gens)//10]
      
      feature_ranks = {}
      for gen in sample_gens:
          gen_str = str(gen)
          gen_data = self.data[gen_str]
          indices = gen_data['feature_indices']
          contributions = [gen_data['feature_contribution'][i] for i in indices]
          
          feature_contribs = list(zip(indices, contributions))
          sorted_features = sorted(feature_contribs, key=lambda x: x[1], reverse=True)[:max_features]
          
          for rank, (feature, _) in enumerate(sorted_features, 1):
              if feature not in feature_ranks:
                  feature_ranks[feature] = []
              feature_ranks[feature].append((gen, rank))
      
      plt.figure(figsize=(12, 8))
      for feature, ranks in feature_ranks.items():
          gens, rank_values = zip(*ranks)
          plt.plot(gens, rank_values, '-o', label=f'Feature {feature}')

      # plt.figure(figsize=(12, 8))
      
      # # Use a distinctive color palette
      # colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', 
      #           '#ff7f00', '#ffff33', '#a65628', '#f781bf',
      #           '#999999', '#66c2a5', '#fc8d62', '#8da0cb']
                
      # for i, (feature, ranks) in enumerate(feature_ranks.items()):
      #     gens, rank_values = zip(*ranks)
      #     plt.plot(gens, rank_values, '-o', 
      #             color=colors[i % len(colors)], 
      #             linewidth=2,
      #             label=f'Feature {feature}')

      plt.gca().invert_yaxis()
      plt.ylim(max_features + 0.5, 0.5)
      plt.xlabel('Generation')
      plt.ylabel('Rank')
      plt.title('Feature Importance Ranking Evolution')
      plt.legend(bbox_to_anchor=(1.05, 1), loc='upper left')
      
      if save_path:
          plt.savefig(save_path, bbox_inches='tight', dpi=300)
          plt.close()
      return plt.gcf()

    def plot_parallel_sets(self, sample_gens=None, max_features=15, save_path=None):
        if sample_gens is None:
            all_gens = sorted([int(g) for g in self.data.keys() if g != 'eliteMapIndex'])
            indices = np.linspace(0, len(all_gens)-1, 4).astype(int)
            sample_gens = [all_gens[i] for i in indices]
        
        df_records = []
        for gen in sample_gens:
            features = self.data[str(gen)]['feature_indices'][:max_features]
            contributions = self.data[str(gen)]['feature_contribution'][:max_features]
            
            for f, c in zip(features, contributions):
                df_records.append({
                    'Generation': f'Gen_{gen}',
                    'Feature': f'F_{f}',
                    'Contribution_Level': 'High' if c > np.median(contributions) else 'Low'
                })
        
        df = pd.DataFrame(df_records)
        
        fig = go.Figure(data=[go.Parcats(
            dimensions=[{
                'label': col,
                'values': df[col].values
            } for col in ['Generation', 'Feature', 'Contribution_Level']],
            line={'color': df.index, 'colorscale': 'Viridis'}
        )])
        
        if save_path:
            fig.write_image(save_path)
        return fig

    def generate_all_plots(self, output_dir='plots'):
        output_dir = Path(output_dir)
        output_dir.mkdir(exist_ok=True)
        
        # self.plot_evolution_metrics(output_dir / 'evolution_metrics.pdf')
        # self.plot_feature_retention_heatmap(output_dir / 'retention_heatmap.pdf')
        # self.plot_contribution_distributions(save_path=output_dir / 'contribution_dist.pdf')
        # self.plot_coselection_network(save_path=output_dir / 'coselection_network.pdf')
        # self.plot_sankey(save_path=output_dir / 'sankey.pdf')
        # self.plot_alluvial(save_path=output_dir / 'alluvial.pdf')
        self.plot_bump_chart(save_path=output_dir / 'bump_chart.pdf')
        # self.plot_parallel_sets(save_path=output_dir / 'parallel_sets.pdf')

if __name__ == "__main__":
    analyzer = FeatureEvolutionAnalyzer('/Users/bjornpjo/Downloads/feature_data.json')
    analyzer.generate_all_plots()